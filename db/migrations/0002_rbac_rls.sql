-- =====================================================================
-- 0002_rbac_rls.sql  -  Permission catalogue, default roles, helper
-- functions, Row Level Security policies, guard triggers and grants.
--
-- How enforcement works
--   * The Next.js server authenticates the user (session cookie) and then runs
--     every business query inside a transaction that does:
--         SET LOCAL ROLE app_authenticated;
--         SELECT set_config('app.user_id', '<uuid>', true);
--   * app_authenticated is NOT a superuser / owner, so Row Level Security applies.
--   * Policies call SECURITY DEFINER helper functions (app_has_perm, app_can_*)
--     that resolve the caller's role permissions + project membership.
--   * Credentials, sessions and reset tokens have NO grants for app_authenticated.
-- =====================================================================

-- ---------- permission catalogue ---------------------------------------
insert into "proj-dashboard-permissions" (code, name, description, group_name) values
 ('project.view_all',            'View all projects',               'See every project in the company',                         'Projects'),
 ('project.create',              'Create projects',                 'Create new projects',                                      'Projects'),
 ('project.update_all',          'Edit any project',                'Edit every project regardless of assignment',              'Projects'),
 ('project.update_assigned',     'Edit assigned projects',          'Edit projects where the user holds the edit flag',         'Projects'),
 ('project.delete',              'Delete / archive-delete projects','Soft-delete projects (archive does not need this)',        'Projects'),
 ('project.assign_manager',      'Assign project manager',          'Change the project manager of a project',                  'Projects'),
 ('project.manage_team_all',     'Manage any project team',         'Add/remove members on every project',                      'Projects'),
 ('project.manage_team_assigned','Manage assigned project teams',   'Manage the team of projects where the user has the flag',  'Projects'),
 ('project.view_contract_value', 'View contract value',             'See project contract values',                              'Projects'),
 ('project.edit_contract_value', 'Edit contract value',             'Change project contract values',                           'Projects'),
 ('document.upload_all',         'Upload to any project',           'Upload / edit documents on every project',                 'Documents'),
 ('document.upload_assigned',    'Upload to assigned projects',     'Upload documents where the user holds the upload flag',    'Documents'),
 ('document.delete_all',         'Delete any document',             'Delete / restore documents on every project',              'Documents'),
 ('document.delete_assigned',    'Delete assigned documents',       'Delete documents where the user holds the delete flag',    'Documents'),
 ('document.download',           'Download documents',              'Download PDFs (preview needs only project access)',        'Documents'),
 ('category.manage',             'Manage document categories',      'Create, edit, deactivate and delete categories',           'Documents'),
 ('user.view',                   'View user directory',             'Open the Users & Access page (read only)',                 'Administration'),
 ('user.manage',                 'Manage users',                    'Create, edit, deactivate users and assign roles',          'Administration'),
 ('role.manage',                 'Manage roles & permissions',      'Edit the role/permission matrix',                          'Administration'),
 ('settings.manage',             'Manage system settings',          'Retention policy, upload limits, trash purge',             'Administration'),
 ('audit.view',                  'View company-wide audit log',     'See activity of all projects and users',                   'Reporting'),
 ('report.view',                 'View reports',                    'Open the Reports module',                                  'Reporting'),
 ('report.export',               'Export reports',                  'Export reports to PDF, Excel and CSV',                     'Reporting'),
 ('filter.save',                 'Save filter combinations',        'Save and reuse dashboard filter sets',                     'Reporting');

insert into "proj-dashboard-roles" (code, name, description, is_system) values
 ('super_admin',     'Super Admin',     'Full access to the entire application',                                true),
 ('management',      'Management',      'Company-wide, read-only visibility of projects, documents and reports', true),
 ('project_manager', 'Project Manager', 'Manages assigned projects, documents and teams',                       true),
 ('engineer',        'Engineer / Project Staff', 'Works on assigned projects; uploads when permitted',          true),
 ('viewer',          'Viewer',          'Read-only access to authorised projects and documents',                true);

-- Super admin gets everything (also hard-wired in app_has_perm so it can never be locked out).
insert into "proj-dashboard-role-permissions" (role_id, permission_id)
select r.id, p.id from "proj-dashboard-roles" r cross join "proj-dashboard-permissions" p where r.code = 'super_admin';

insert into "proj-dashboard-role-permissions" (role_id, permission_id)
select r.id, p.id from "proj-dashboard-roles" r join "proj-dashboard-permissions" p on p.code in
  ('project.view_all','project.view_contract_value','document.download','report.view','report.export','audit.view','filter.save')
where r.code = 'management';

insert into "proj-dashboard-role-permissions" (role_id, permission_id)
select r.id, p.id from "proj-dashboard-roles" r join "proj-dashboard-permissions" p on p.code in
  ('project.update_assigned','project.manage_team_assigned','document.upload_assigned','document.delete_assigned',
   'document.download','report.view','report.export','filter.save')
where r.code = 'project_manager';

insert into "proj-dashboard-role-permissions" (role_id, permission_id)
select r.id, p.id from "proj-dashboard-roles" r join "proj-dashboard-permissions" p on p.code in
  ('document.upload_assigned','document.download','report.view','filter.save')
where r.code = 'engineer';

insert into "proj-dashboard-role-permissions" (role_id, permission_id)
select r.id, p.id from "proj-dashboard-roles" r join "proj-dashboard-permissions" p on p.code in ('document.download')
where r.code = 'viewer';

-- ---------- default document categories --------------------------------
insert into "proj-dashboard-document-categories" (name, sort_order) values
 ('Contracts & Agreements', 10), ('Drawings', 20), ('BOQ', 30), ('Technical Specifications', 40),
 ('Method Statements', 50), ('Material Submittals', 60), ('Inspection Reports', 70), ('Progress Reports', 80),
 ('Project Correspondence', 90), ('Meeting Minutes', 100), ('Approvals', 110), ('Other Documents', 999);

insert into "proj-dashboard-settings" (key, value) values
 ('retention_days', '30'::jsonb),
 ('max_upload_mb',  '50'::jsonb);

-- ---------- request-context helper functions ---------------------------
create or replace function app_uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_has_perm(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from "proj-dashboard-user-roles" ur
    join "proj-dashboard-users" u on u.id = ur.user_id and u.is_active
    join "proj-dashboard-roles" r on r.id = ur.role_id
    left join "proj-dashboard-role-permissions" rp on rp.role_id = r.id
    left join "proj-dashboard-permissions" pm on pm.id = rp.permission_id
    where ur.user_id = app_uid()
      and (r.code = 'super_admin' or pm.code = p_code)
  )
$$;

create or replace function app_is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from "proj-dashboard-project-members" m
                 join "proj-dashboard-users" u on u.id = m.user_id and u.is_active
                 where m.project_id = p_project and m.user_id = app_uid())
$$;

create or replace function app_member_flag(p_project uuid, p_flag text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case p_flag
            when 'edit'        then m.can_edit
            when 'upload'      then m.can_upload
            when 'delete_docs' then m.can_delete_docs
            when 'manage_team' then m.can_manage_team
          end
     from "proj-dashboard-project-members" m where m.project_id = p_project and m.user_id = app_uid()), false)
$$;

create or replace function app_can_view_project(p_project uuid) returns boolean
language sql stable as $$
  select app_uid() is not null and (app_has_perm('project.view_all') or app_is_member(p_project))
$$;

create or replace function app_can_edit_project(p_project uuid) returns boolean
language sql stable as $$
  select app_has_perm('project.update_all')
      or (app_has_perm('project.update_assigned') and app_member_flag(p_project, 'edit'))
$$;

create or replace function app_can_upload(p_project uuid) returns boolean
language sql stable as $$
  select app_can_view_project(p_project) and (app_has_perm('document.upload_all')
      or (app_has_perm('document.upload_assigned') and app_member_flag(p_project, 'upload')))
$$;

create or replace function app_can_delete_doc(p_project uuid) returns boolean
language sql stable as $$
  select app_can_view_project(p_project) and (app_has_perm('document.delete_all')
      or (app_has_perm('document.delete_assigned') and app_member_flag(p_project, 'delete_docs')))
$$;

create or replace function app_can_manage_team(p_project uuid) returns boolean
language sql stable as $$
  select app_can_view_project(p_project) and (app_has_perm('project.manage_team_all')
      or (app_has_perm('project.manage_team_assigned') and app_member_flag(p_project, 'manage_team')))
$$;

-- ---------- guard triggers (column-level rules RLS cannot express) ------
-- All guards are skipped for trusted system sessions (app.user_id not set).
create or replace function trg_projects_guard() returns trigger language plpgsql as $$
begin
  if app_uid() is null then return new; end if;
  if new.deleted_at is distinct from old.deleted_at and not app_has_perm('project.delete') then
    raise exception 'Permission denied: deleting projects requires project.delete' using errcode = '42501';
  end if;
  if new.project_manager_id is distinct from old.project_manager_id and not app_has_perm('project.assign_manager') then
    raise exception 'Permission denied: changing the project manager requires project.assign_manager' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_projects_guard before update on "proj-dashboard-projects" for each row execute function trg_projects_guard();

create or replace function trg_documents_guard() returns trigger language plpgsql as $$
begin
  if app_uid() is null then return new; end if;
  if new.deleted_at is distinct from old.deleted_at and not app_can_delete_doc(old.project_id) then
    raise exception 'Permission denied: deleting or restoring documents is not allowed for this project' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_documents_guard before update on "proj-dashboard-documents" for each row execute function trg_documents_guard();

create or replace function trg_users_guard() returns trigger language plpgsql as $$
begin
  if app_uid() is null then return new; end if;
  if not app_has_perm('user.manage') and
     (new.is_active is distinct from old.is_active or new.email is distinct from old.email
      or new.username is distinct from old.username or new.is_demo is distinct from old.is_demo) then
    raise exception 'Permission denied: only user managers can change account status or e-mail' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_users_guard before update on "proj-dashboard-users" for each row execute function trg_users_guard();

-- ---------- grants ------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_authenticated') then
    create role app_authenticated nologin;
  end if;
end $$;
grant app_authenticated to current_user;
grant usage on schema public to app_authenticated;
grant select, insert, update, delete on
  "proj-dashboard-roles", "proj-dashboard-permissions", "proj-dashboard-role-permissions", "proj-dashboard-users",
  "proj-dashboard-user-roles", "proj-dashboard-settings", "proj-dashboard-projects", "proj-dashboard-project-financials",
  "proj-dashboard-project-members", "proj-dashboard-document-categories", "proj-dashboard-documents",
  "proj-dashboard-document-revisions", "proj-dashboard-notifications", "proj-dashboard-saved-filters"
  to app_authenticated;
grant select, insert on "proj-dashboard-logs" to app_authenticated;
grant usage, select on sequence project_code_seq to app_authenticated;
grant execute on all functions in schema public to app_authenticated;

-- ---------- Row Level Security ------------------------------------------
alter table "proj-dashboard-roles"                enable row level security;
alter table "proj-dashboard-permissions"          enable row level security;
alter table "proj-dashboard-role-permissions"     enable row level security;
alter table "proj-dashboard-users"                enable row level security;
alter table "proj-dashboard-user-roles"           enable row level security;
alter table "proj-dashboard-settings"         enable row level security;
alter table "proj-dashboard-projects"             enable row level security;
alter table "proj-dashboard-project-financials"   enable row level security;
alter table "proj-dashboard-project-members"      enable row level security;
alter table "proj-dashboard-document-categories"  enable row level security;
alter table "proj-dashboard-documents"    enable row level security;
alter table "proj-dashboard-document-revisions"   enable row level security;
alter table "proj-dashboard-notifications"        enable row level security;
alter table "proj-dashboard-logs"        enable row level security;
alter table "proj-dashboard-saved-filters"        enable row level security;
-- Not exposed to the app role at all (no grants) but locked down for safety:
alter table "proj-dashboard-user-credentials"      enable row level security;
alter table "proj-dashboard-sessions"              enable row level security;
alter table "proj-dashboard-password-reset-tokens" enable row level security;
alter table "proj-dashboard-login-attempts"        enable row level security;

-- reference data -----------------------------------------------------------
create policy roles_select on "proj-dashboard-roles" for select to app_authenticated using (app_uid() is not null);
create policy roles_insert on "proj-dashboard-roles" for insert to app_authenticated with check (app_has_perm('role.manage'));
create policy roles_update on "proj-dashboard-roles" for update to app_authenticated using (app_has_perm('role.manage')) with check (app_has_perm('role.manage'));
create policy roles_delete on "proj-dashboard-roles" for delete to app_authenticated using (app_has_perm('role.manage') and not is_system);

create policy perms_select on "proj-dashboard-permissions" for select to app_authenticated using (app_uid() is not null);

create policy rp_select on "proj-dashboard-role-permissions" for select to app_authenticated using (app_uid() is not null);
create policy rp_insert on "proj-dashboard-role-permissions" for insert to app_authenticated with check (app_has_perm('role.manage'));
create policy rp_delete on "proj-dashboard-role-permissions" for delete to app_authenticated using (app_has_perm('role.manage'));

create policy settings_select on "proj-dashboard-settings" for select to app_authenticated using (app_uid() is not null);
create policy settings_insert on "proj-dashboard-settings" for insert to app_authenticated with check (app_has_perm('settings.manage'));
create policy settings_update on "proj-dashboard-settings" for update to app_authenticated using (app_has_perm('settings.manage')) with check (app_has_perm('settings.manage'));

create policy categories_select on "proj-dashboard-document-categories" for select to app_authenticated using (app_uid() is not null);
create policy categories_insert on "proj-dashboard-document-categories" for insert to app_authenticated with check (app_has_perm('category.manage'));
create policy categories_update on "proj-dashboard-document-categories" for update to app_authenticated using (app_has_perm('category.manage')) with check (app_has_perm('category.manage'));
create policy categories_delete on "proj-dashboard-document-categories" for delete to app_authenticated using (app_has_perm('category.manage'));

-- users --------------------------------------------------------------------
create policy users_select on "proj-dashboard-users" for select to app_authenticated using (app_uid() is not null);
create policy users_insert on "proj-dashboard-users" for insert to app_authenticated with check (app_has_perm('user.manage'));
create policy users_update on "proj-dashboard-users" for update to app_authenticated
  using (app_has_perm('user.manage') or id = app_uid())
  with check (app_has_perm('user.manage') or id = app_uid());
create policy users_delete on "proj-dashboard-users" for delete to app_authenticated using (app_has_perm('user.manage') and id <> app_uid());

create policy user_roles_select on "proj-dashboard-user-roles" for select to app_authenticated using (app_uid() is not null);
create policy user_roles_insert on "proj-dashboard-user-roles" for insert to app_authenticated with check (app_has_perm('user.manage'));
create policy user_roles_update on "proj-dashboard-user-roles" for update to app_authenticated using (app_has_perm('user.manage')) with check (app_has_perm('user.manage'));
create policy user_roles_delete on "proj-dashboard-user-roles" for delete to app_authenticated using (app_has_perm('user.manage'));

-- projects -----------------------------------------------------------------
create policy projects_select on "proj-dashboard-projects" for select to app_authenticated using (app_can_view_project(id));
create policy projects_insert on "proj-dashboard-projects" for insert to app_authenticated with check (app_has_perm('project.create'));
create policy projects_update on "proj-dashboard-projects" for update to app_authenticated
  using (app_can_edit_project(id)) with check (app_can_edit_project(id));
create policy projects_delete on "proj-dashboard-projects" for delete to app_authenticated using (app_has_perm('project.delete'));

create policy fin_select on "proj-dashboard-project-financials" for select to app_authenticated
  using (app_has_perm('project.view_contract_value') and app_can_view_project(project_id));
create policy fin_insert on "proj-dashboard-project-financials" for insert to app_authenticated
  with check (app_has_perm('project.edit_contract_value') and app_can_edit_project(project_id));
create policy fin_update on "proj-dashboard-project-financials" for update to app_authenticated
  using (app_has_perm('project.edit_contract_value') and app_can_edit_project(project_id))
  with check (app_has_perm('project.edit_contract_value') and app_can_edit_project(project_id));
create policy fin_delete on "proj-dashboard-project-financials" for delete to app_authenticated
  using (app_has_perm('project.edit_contract_value') and app_can_edit_project(project_id));

create policy pm_select on "proj-dashboard-project-members" for select to app_authenticated using (app_can_view_project(project_id));
create policy pm_insert on "proj-dashboard-project-members" for insert to app_authenticated with check (app_can_manage_team(project_id));
create policy pm_update on "proj-dashboard-project-members" for update to app_authenticated
  using (app_can_manage_team(project_id)) with check (app_can_manage_team(project_id));
create policy pm_delete on "proj-dashboard-project-members" for delete to app_authenticated using (app_can_manage_team(project_id));

-- documents ----------------------------------------------------------------
create policy docs_select on "proj-dashboard-documents" for select to app_authenticated using (app_can_view_project(project_id));
create policy docs_insert on "proj-dashboard-documents" for insert to app_authenticated with check (app_can_upload(project_id));
create policy docs_update on "proj-dashboard-documents" for update to app_authenticated
  using (app_can_upload(project_id) or app_can_delete_doc(project_id))
  with check (app_can_upload(project_id) or app_can_delete_doc(project_id));
create policy docs_delete on "proj-dashboard-documents" for delete to app_authenticated using (app_can_delete_doc(project_id));

create policy rev_select on "proj-dashboard-document-revisions" for select to app_authenticated
  using (exists (select 1 from "proj-dashboard-documents" d where d.id = document_id));
create policy rev_insert on "proj-dashboard-document-revisions" for insert to app_authenticated
  with check (exists (select 1 from "proj-dashboard-documents" d where d.id = document_id and app_can_upload(d.project_id)));
create policy rev_delete on "proj-dashboard-document-revisions" for delete to app_authenticated
  using (exists (select 1 from "proj-dashboard-documents" d where d.id = document_id and app_can_delete_doc(d.project_id)));

-- notifications / activity / saved filters ------------------------------------
create policy notif_select on "proj-dashboard-notifications" for select to app_authenticated using (user_id = app_uid());
create policy notif_insert on "proj-dashboard-notifications" for insert to app_authenticated with check (app_uid() is not null);
create policy notif_update on "proj-dashboard-notifications" for update to app_authenticated using (user_id = app_uid()) with check (user_id = app_uid());
create policy notif_delete on "proj-dashboard-notifications" for delete to app_authenticated using (user_id = app_uid());

create policy activity_select on "proj-dashboard-logs" for select to app_authenticated
  using (app_has_perm('audit.view') or user_id = app_uid() or (project_id is not null and app_can_view_project(project_id)));
create policy activity_insert on "proj-dashboard-logs" for insert to app_authenticated with check (user_id = app_uid());

create policy sf_select on "proj-dashboard-saved-filters" for select to app_authenticated using (user_id = app_uid());
create policy sf_insert on "proj-dashboard-saved-filters" for insert to app_authenticated with check (user_id = app_uid() and app_has_perm('filter.save'));
create policy sf_update on "proj-dashboard-saved-filters" for update to app_authenticated using (user_id = app_uid()) with check (user_id = app_uid());
create policy sf_delete on "proj-dashboard-saved-filters" for delete to app_authenticated using (user_id = app_uid());
