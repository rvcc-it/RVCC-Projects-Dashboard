-- =====================================================================================================
-- RVCC Projects Portal - complete database setup for Supabase (migrations 0001 to 0007 in one file).
-- Paste ALL of this into the Supabase SQL editor and press Run ONCE, on an empty project.
-- It is one transaction: if anything fails, nothing is created and you can fix it and run again.
-- Afterwards run, in this order:  docs/PROJECTS-INSERT.sql (steps 1-2), docs/PROJECTS-UPDATE-CLIENTS.sql.
-- You also need a first Super Admin to sign in: see docs/DATA-QUERIES.sql section 3 (use role code super_admin).
-- (If you later run  npm run db:migrate  against this database, it will see these migrations as already applied.)
-- =====================================================================================================
begin;
create table if not exists "proj-dashboard-migrations" (name text primary key, applied_at timestamptz not null default now());

-- ------------------------------ 0001_schema.sql ------------------------------
-- =====================================================================
-- 0001_schema.sql  -  Core schema for the RVCC Projects & Documents Portal
-- PostgreSQL 14+ (tested on 18). UUID primary keys, FKs, indexes,
-- created_at / updated_at / created_by / updated_by audit columns.
-- =====================================================================

-- ---------- helper: updated_at trigger ---------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- RBAC reference tables --------------------------------------
create table "proj-dashboard-roles" (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  updated_by  uuid
);

create table "proj-dashboard-permissions" (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  group_name  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table "proj-dashboard-role-permissions" (
  role_id       uuid not null references "proj-dashboard-roles"(id) on delete cascade,
  permission_id uuid not null references "proj-dashboard-permissions"(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  primary key (role_id, permission_id)
);
create index idx_role_permissions_perm on "proj-dashboard-role-permissions"(permission_id);

-- ---------- users -------------------------------------------------------
create table "proj-dashboard-users" (
  id            uuid primary key default gen_random_uuid(),
  email         text not null check (email = lower(email) and position('@' in email) > 1),
  username      text check (username is null or username = lower(username)),
  full_name     text not null check (length(trim(full_name)) > 0),
  department    text,
  job_title     text,
  phone         text,
  is_active     boolean not null default true,
  is_demo       boolean not null default false,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references "proj-dashboard-users"(id) on delete set null,
  updated_by    uuid references "proj-dashboard-users"(id) on delete set null
);
create unique index uq_users_email on "proj-dashboard-users"(email);
create unique index uq_users_username on "proj-dashboard-users"(username) where username is not null;
create index idx_users_active on "proj-dashboard-users"(is_active);

alter table "proj-dashboard-roles" add constraint fk_roles_created_by foreign key (created_by) references "proj-dashboard-users"(id) on delete set null;
alter table "proj-dashboard-roles" add constraint fk_roles_updated_by foreign key (updated_by) references "proj-dashboard-users"(id) on delete set null;
alter table "proj-dashboard-role-permissions" add constraint fk_rp_created_by foreign key (created_by) references "proj-dashboard-users"(id) on delete set null;

create table "proj-dashboard-user-roles" (
  user_id    uuid not null references "proj-dashboard-users"(id) on delete cascade,
  role_id    uuid not null references "proj-dashboard-roles"(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references "proj-dashboard-users"(id) on delete set null,
  primary key (user_id, role_id)
);
create index idx_user_roles_role on "proj-dashboard-user-roles"(role_id);

-- Credentials & sessions are never exposed to the application's RLS role.
create table "proj-dashboard-user-credentials" (
  user_id              uuid primary key references "proj-dashboard-users"(id) on delete cascade,
  password_hash        text not null,
  must_change_password boolean not null default false,
  password_changed_at  timestamptz not null default now()
);

create table "proj-dashboard-sessions" (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references "proj-dashboard-users"(id) on delete cascade,
  token_hash text not null unique,
  remember   boolean not null default false,
  user_agent text,
  ip         text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index idx_sessions_user on "proj-dashboard-sessions"(user_id);
create index idx_sessions_expires on "proj-dashboard-sessions"(expires_at);

create table "proj-dashboard-password-reset-tokens" (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references "proj-dashboard-users"(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index idx_prt_user on "proj-dashboard-password-reset-tokens"(user_id);

create table "proj-dashboard-login-attempts" (
  id         bigserial primary key,
  identifier text not null,
  ip         text,
  success    boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_login_attempts_ident on "proj-dashboard-login-attempts"(identifier, created_at desc);

create table "proj-dashboard-settings" (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references "proj-dashboard-users"(id) on delete set null
);

-- ---------- projects ----------------------------------------------------
create sequence project_code_seq start 1;

create table "proj-dashboard-projects" (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$'),
  name                text not null check (length(trim(name)) > 0),
  client_name         text not null,
  main_contractor     text,
  consultant          text,
  location            text not null,
  description         text,
  category            text not null default 'Building Construction',
  project_manager_id  uuid references "proj-dashboard-users"(id) on delete set null,
  status              text not null default 'planning'
                      check (status in ('planning','active','on_hold','completed','cancelled')),
  progress            smallint not null default 0 check (progress between 0 and 100),
  start_date          date,
  expected_completion date,
  actual_completion   date,
  cover_key           text,
  cover_mime          text,
  remarks             text,
  is_archived         boolean not null default false,
  archived_at         timestamptz,
  deleted_at          timestamptz,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references "proj-dashboard-users"(id) on delete set null,
  updated_by          uuid references "proj-dashboard-users"(id) on delete set null,
  constraint chk_project_dates check (expected_completion is null or start_date is null or expected_completion >= start_date),
  constraint chk_project_actual check (actual_completion is null or start_date is null or actual_completion >= start_date)
);
create unique index uq_projects_code on "proj-dashboard-projects"(lower(code));
create index idx_projects_status on "proj-dashboard-projects"(status) where deleted_at is null;
create index idx_projects_location on "proj-dashboard-projects"(location);
create index idx_projects_manager on "proj-dashboard-projects"(project_manager_id);
create index idx_projects_client on "proj-dashboard-projects"(client_name);
create index idx_projects_category on "proj-dashboard-projects"(category);
create index idx_projects_start on "proj-dashboard-projects"(start_date);
create index idx_projects_expected on "proj-dashboard-projects"(expected_completion);
create index idx_projects_deleted on "proj-dashboard-projects"(deleted_at);
create index idx_projects_name_search on "proj-dashboard-projects" using gin (to_tsvector('simple', name || ' ' || code || ' ' || location));

-- Contract value lives in its own table so that it can be protected by its own RLS policy.
create table "proj-dashboard-project-financials" (
  project_id     uuid primary key references "proj-dashboard-projects"(id) on delete cascade,
  contract_value numeric(16,2) check (contract_value is null or contract_value >= 0),
  currency       text not null default 'SAR',
  updated_at     timestamptz not null default now(),
  updated_by     uuid references "proj-dashboard-users"(id) on delete set null
);

create table "proj-dashboard-project-members" (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references "proj-dashboard-projects"(id) on delete cascade,
  user_id         uuid not null references "proj-dashboard-users"(id) on delete cascade,
  member_role     text not null default 'engineer' check (member_role in ('manager','engineer','member','viewer')),
  can_edit        boolean not null default false,  -- edit project info
  can_upload      boolean not null default false,  -- upload / edit documents
  can_delete_docs boolean not null default false,  -- delete documents
  can_manage_team boolean not null default false,  -- manage project team
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references "proj-dashboard-users"(id) on delete set null,
  updated_by      uuid references "proj-dashboard-users"(id) on delete set null,
  unique (project_id, user_id)
);
create index idx_pm_user on "proj-dashboard-project-members"(user_id);
create index idx_pm_project on "proj-dashboard-project-members"(project_id);

-- ---------- documents ---------------------------------------------------
create table "proj-dashboard-document-categories" (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references "proj-dashboard-users"(id) on delete set null,
  updated_by  uuid references "proj-dashboard-users"(id) on delete set null
);
create unique index uq_doc_categories_name on "proj-dashboard-document-categories"(lower(name));

create table "proj-dashboard-documents" (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references "proj-dashboard-projects"(id) on delete cascade,
  category_id         uuid not null references "proj-dashboard-document-categories"(id) on delete restrict,
  title               text not null check (length(trim(title)) > 0),
  description         text,
  document_date       date,
  current_revision_no integer not null default 1,
  deleted_at          timestamptz,
  deleted_by          uuid references "proj-dashboard-users"(id) on delete set null,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references "proj-dashboard-users"(id) on delete set null,
  updated_by          uuid references "proj-dashboard-users"(id) on delete set null
);
create index idx_docs_project on "proj-dashboard-documents"(project_id) where deleted_at is null;
create index idx_docs_category on "proj-dashboard-documents"(category_id);
create index idx_docs_created on "proj-dashboard-documents"(created_at);
create index idx_docs_deleted on "proj-dashboard-documents"(deleted_at);
create index idx_docs_title_search on "proj-dashboard-documents" using gin (to_tsvector('simple', title));

create table "proj-dashboard-document-revisions" (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references "proj-dashboard-documents"(id) on delete cascade,
  revision_no    integer not null check (revision_no >= 1),
  revision_label text not null default '0',
  file_name      text not null,
  storage_key    text not null unique,
  file_size      bigint not null check (file_size > 0),
  mime_type      text not null default 'application/pdf',
  checksum       text,
  notes          text,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  created_by     uuid references "proj-dashboard-users"(id) on delete set null,
  unique (document_id, revision_no)
);
create index idx_revisions_doc on "proj-dashboard-document-revisions"(document_id);
create index idx_revisions_created on "proj-dashboard-document-revisions"(created_at);
create index idx_revisions_creator on "proj-dashboard-document-revisions"(created_by);

-- ---------- notifications, activity, saved filters ----------------------
create table "proj-dashboard-notifications" (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references "proj-dashboard-users"(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  project_id  uuid references "proj-dashboard-projects"(id) on delete cascade,
  document_id uuid references "proj-dashboard-documents"(id) on delete cascade,
  is_read     boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references "proj-dashboard-users"(id) on delete set null
);
create index idx_notifications_user on "proj-dashboard-notifications"(user_id, is_read, created_at desc);

create table "proj-dashboard-logs" (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references "proj-dashboard-users"(id) on delete set null,
  user_name      text not null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  project_id     uuid references "proj-dashboard-projects"(id) on delete set null,
  document_id    uuid references "proj-dashboard-documents"(id) on delete set null,
  summary        text not null,
  previous_value jsonb,
  new_value      jsonb,
  ip             text,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index idx_activity_project on "proj-dashboard-logs"(project_id, created_at desc);
create index idx_activity_created on "proj-dashboard-logs"(created_at desc);
create index idx_activity_user on "proj-dashboard-logs"(user_id);
create index idx_activity_action on "proj-dashboard-logs"(action);

create table "proj-dashboard-saved-filters" (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references "proj-dashboard-users"(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  scope      text not null default 'dashboard',
  filters    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references "proj-dashboard-users"(id) on delete set null,
  updated_by uuid references "proj-dashboard-users"(id) on delete set null
);
create unique index uq_saved_filters_name on "proj-dashboard-saved-filters"(user_id, scope, lower(name));

-- ---------- updated_at triggers ----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['proj-dashboard-roles','proj-dashboard-permissions','proj-dashboard-users','proj-dashboard-settings',
                           'proj-dashboard-projects','proj-dashboard-project-financials','proj-dashboard-project-members',
                           'proj-dashboard-document-categories','proj-dashboard-documents','proj-dashboard-saved-filters']
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   'trg_updated_' || replace(t, '-', '_'), t);
  end loop;
end $$;

insert into "proj-dashboard-migrations"(name) values ('0001_schema.sql');

-- ------------------------------ 0002_rbac_rls.sql ------------------------------
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

insert into "proj-dashboard-migrations"(name) values ('0002_rbac_rls.sql');

-- ------------------------------ 0003_storage_outbox_credentials.sql ------------------------------
-- =====================================================================
-- 0003: storage deletion outbox (no orphaned files) + permission-checked
-- credential functions (the app role has no direct access to credentials).
-- =====================================================================

-- Rows are written in the SAME transaction that deletes the database records,
-- so a file is either still referenced, or queued for removal. A retry job
-- (maintenance purge) drains anything that could not be deleted immediately.
create table "proj-dashboard-storage-deletions" (
  id         uuid primary key default gen_random_uuid(),
  storage_key text not null,
  created_at timestamptz not null default now(),
  attempts   integer not null default 0,
  last_error text
);
create index idx_storage_deletions_created on "proj-dashboard-storage-deletions"(created_at);
alter table "proj-dashboard-storage-deletions" enable row level security; -- no policies / no grants for the app role

create or replace function app_set_password(p_user uuid, p_hash text, p_must_change boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if app_uid() is null or not (app_has_perm('user.manage') or p_user = app_uid()) then
    raise exception 'Permission denied: not allowed to set this password' using errcode = '42501';
  end if;
  insert into "proj-dashboard-user-credentials" (user_id, password_hash, must_change_password)
  values (p_user, p_hash, p_must_change)
  on conflict (user_id) do update
    set password_hash = excluded.password_hash,
        must_change_password = excluded.must_change_password,
        password_changed_at = now();
  delete from "proj-dashboard-sessions" where user_id = p_user;
end $$;

create or replace function app_revoke_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if app_uid() is null or not (app_has_perm('user.manage') or p_user = app_uid()) then
    raise exception 'Permission denied: not allowed to revoke these sessions' using errcode = '42501';
  end if;
  delete from "proj-dashboard-sessions" where user_id = p_user;
end $$;

grant execute on function app_set_password(uuid, text, boolean) to app_authenticated;
grant execute on function app_revoke_sessions(uuid) to app_authenticated;

insert into "proj-dashboard-migrations"(name) values ('0003_storage_outbox_credentials.sql');

-- ------------------------------ 0004_revision_update_policy.sql ------------------------------
-- Allow correcting the label of a revision (metadata only) for users who may upload to the project.
create policy rev_update on "proj-dashboard-document-revisions" for update to app_authenticated
  using (exists (select 1 from "proj-dashboard-documents" d where d.id = document_id and app_can_upload(d.project_id)))
  with check (exists (select 1 from "proj-dashboard-documents" d where d.id = document_id and app_can_upload(d.project_id)));

-- Stored files are immutable: forbid changing the file reference or size of an existing revision.
create or replace function trg_revisions_immutable() returns trigger language plpgsql as $$
begin
  if new.storage_key is distinct from old.storage_key or new.file_size is distinct from old.file_size
     or new.checksum is distinct from old.checksum or new.document_id is distinct from old.document_id
     or new.revision_no is distinct from old.revision_no then
    raise exception 'Permission denied: stored revision files are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_revisions_immutable before update on "proj-dashboard-document-revisions" for each row execute function trg_revisions_immutable();

insert into "proj-dashboard-migrations"(name) values ('0004_revision_update_policy.sql');

-- ------------------------------ 0005_notification_author.sql ------------------------------
-- Notifications may only be created in the caller's own name (prevents forged notifications at the database level).
drop policy if exists notif_insert on "proj-dashboard-notifications";
create policy notif_insert on "proj-dashboard-notifications" for insert to app_authenticated
  with check (app_uid() is not null and created_by = app_uid());

insert into "proj-dashboard-migrations"(name) values ('0005_notification_author.sql');

-- ------------------------------ 0006_supabase_lockdown.sql ------------------------------
-- Supabase exposes the "public" schema through its REST API (PostgREST) using the anon / authenticated roles.
-- This portal never uses that API: all access goes through the server with its own role. RLS already denies those
-- roles, and this migration additionally removes Supabase's default privileges so there is no exposure at all.
-- On plain PostgreSQL (no such roles) this is a no-op.
do $$
declare r record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    for r in select tablename from pg_tables where schemaname = 'public' and tablename like 'proj-dashboard-%' loop
      execute format('revoke all on table %I from anon, authenticated', r.tablename);
    end loop;
    revoke all on sequence project_code_seq from anon, authenticated;
    for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname like 'trg\_%' or p.proname = 'set_updated_at') loop
      -- Functions get a default EXECUTE grant to PUBLIC, which anon/authenticated inherit: revoke it too,
      -- then give the portal's own role back exactly what it needs.
      execute format('revoke all on function %s from public, anon, authenticated', r.sig);
      execute format('grant execute on function %s to app_authenticated', r.sig);
    end loop;
  end if;
end $$;

insert into "proj-dashboard-migrations"(name) values ('0006_supabase_lockdown.sql');

-- ------------------------------ 0007_project_categories.sql ------------------------------
-- Project categories / disciplines used to be a hardcoded list in the application code.
-- They now live in the database so they can be changed with plain SQL (see docs/DATA-QUERIES.sql).
-- projects.category stays a text column (no foreign key) so renaming/removing a category never breaks old projects.

create table "proj-dashboard-project-categories" (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  sort_order integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_project_categories_name on "proj-dashboard-project-categories"(lower(name));

create trigger trg_updated_proj_dashboard_project_categories before update on "proj-dashboard-project-categories"
  for each row execute function set_updated_at();

-- carry over the categories that were previously hardcoded, so existing projects keep a matching option
insert into "proj-dashboard-project-categories" (name, sort_order) values
 ('Building Construction', 10), ('Infrastructure & Roads', 20), ('MEP Works', 30), ('Civil Works', 40),
 ('Fit-out & Interiors', 50), ('Industrial & Warehousing', 60), ('Landscaping', 70), ('Maintenance & Renovation', 80)
on conflict do nothing;

-- no hardcoded default category any more: the user must choose one
alter table "proj-dashboard-projects" alter column category drop default;

alter table "proj-dashboard-project-categories" enable row level security;
create policy project_categories_select on "proj-dashboard-project-categories" for select to app_authenticated using (app_uid() is not null);
create policy project_categories_insert on "proj-dashboard-project-categories" for insert to app_authenticated with check (app_has_perm('category.manage'));
create policy project_categories_update on "proj-dashboard-project-categories" for update to app_authenticated using (app_has_perm('category.manage')) with check (app_has_perm('category.manage'));
create policy project_categories_delete on "proj-dashboard-project-categories" for delete to app_authenticated using (app_has_perm('category.manage'));
grant select, insert, update, delete on "proj-dashboard-project-categories" to app_authenticated;

-- Supabase: keep the REST roles away from the new table too (no-op on plain PostgreSQL)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table "proj-dashboard-project-categories" from anon, authenticated;
  end if;
end $$;

insert into "proj-dashboard-migrations"(name) values ('0007_project_categories.sql');

commit;
