-- =====================================================================================================
-- RVCC Projects Portal - SQL for entering and changing REAL data.
-- Run in the Supabase SQL editor (or psql) as the database owner (the "postgres" user).
-- Table names contain hyphens, so they must always be "double quoted".
-- Run each block separately; replace the sample values (between quotes) with your own.
-- Everything here is optional: the same data can also be managed from the portal screens.
-- =====================================================================================================


-- =====================================================================================================
-- 1. LOOK-UP LISTS (what the dropdowns show)
-- =====================================================================================================

-- 1a. Project categories / disciplines (Project form -> "Category / discipline")
insert into "proj-dashboard-project-categories" (name, sort_order) values
  ('Building Construction', 10),
  ('Infrastructure & Roads', 20)
on conflict do nothing;   -- skips names that already exist
-- rename (existing projects keep their old text; update them too if you want them to follow):
--   update "proj-dashboard-project-categories" set name = 'New name' where name = 'Old name';
--   update "proj-dashboard-projects"           set category = 'New name' where category = 'Old name';
-- hide from the dropdown without deleting:
--   update "proj-dashboard-project-categories" set is_active = false where name = 'Landscaping';
-- delete everything and start with only your own list:
--   delete from "proj-dashboard-project-categories";
-- see what exists / what is in use:
--   select c.name, c.sort_order, c.is_active, (select count(*) from "proj-dashboard-projects" p where p.category = c.name) as projects
--     from "proj-dashboard-project-categories" c order by c.sort_order;

-- 1b. Document categories (Documents -> category, Settings -> Document categories)
insert into "proj-dashboard-document-categories" (name, description, sort_order) values
  ('Contracts & Agreements', 'Signed contracts and agreements', 10),
  ('Drawings', null, 20)
on conflict do nothing;
--   update "proj-dashboard-document-categories" set name = 'Shop Drawings' where name = 'Drawings';
--   update "proj-dashboard-document-categories" set is_active = false where name = 'BOQ';
--   delete from "proj-dashboard-document-categories" where name = 'X' and not exists
--     (select 1 from "proj-dashboard-documents" d where d.category_id = id);   -- only when no document uses it

-- 1c. Settings (document retention in days, maximum upload size in MB)
update "proj-dashboard-settings" set value = '30'::jsonb where key = 'retention_days';
update "proj-dashboard-settings" set value = '50'::jsonb where key = 'max_upload_mb';


-- =====================================================================================================
-- 2. ROLES
-- Five system roles exist (super_admin, management, project_manager, engineer, viewer).
-- Add your own role and give it permissions:
-- =====================================================================================================
insert into "proj-dashboard-roles" (code, name, description) values ('site_supervisor', 'Site Supervisor', 'Supervises site work');
insert into "proj-dashboard-role-permissions" (role_id, permission_id)
select r.id, p.id from "proj-dashboard-roles" r, "proj-dashboard-permissions" p
 where r.code = 'site_supervisor' and p.code in ('document.upload_assigned', 'document.download', 'report.view');
--   list all permission codes:  select group_name, code, name from "proj-dashboard-permissions" order by 1, 2;
--   list roles with permissions: select r.code, array_agg(p.code order by p.code) from "proj-dashboard-roles" r
--     left join "proj-dashboard-role-permissions" rp on rp.role_id = r.id left join "proj-dashboard-permissions" p on p.id = rp.permission_id group by r.code;


-- =====================================================================================================
-- 3. USERS
-- The portal stores bcrypt hashes. This uses Postgres pgcrypto (bcrypt, cost 12), which the portal can verify.
-- must_change_password = true forces the person to choose their own password at first sign-in.
--   * Supabase: pgcrypto lives in the "extensions" schema (functions below already use it)
--   * Plain PostgreSQL: run   create extension if not exists pgcrypto;   once, and drop "extensions." below.
-- (Easiest alternative: create users in the portal under Users -> New user.)
-- =====================================================================================================
with u as (
  insert into "proj-dashboard-users" (email, full_name, department, job_title, phone)
  values ('first.last@yourcompany.com', 'First Last', 'Projects', 'Project Manager', '+966 5x xxx xxxx')   -- e-mail must be lower-case
  returning id
), r as (
  insert into "proj-dashboard-user-roles" (user_id, role_id)
  select u.id, (select id from "proj-dashboard-roles" where code = 'project_manager') from u
), c as (
  insert into "proj-dashboard-user-credentials" (user_id, password_hash, must_change_password)
  select u.id, extensions.crypt('Temp#Password-2026', extensions.gen_salt('bf', 12)), true from u
)
select id from u;
--   deactivate / reactivate:   update "proj-dashboard-users" set is_active = false where email = '...';
--   change a role:             update "proj-dashboard-user-roles" set role_id = (select id from "proj-dashboard-roles" where code = 'viewer')
--                               where user_id = (select id from "proj-dashboard-users" where email = '...');
--   reset a password:          update "proj-dashboard-user-credentials" set password_hash = extensions.crypt('New#Temp-2026', extensions.gen_salt('bf', 12)),
--                               must_change_password = true, password_changed_at = now()
--                               where user_id = (select id from "proj-dashboard-users" where email = '...');
--   sign the person out everywhere: delete from "proj-dashboard-sessions" where user_id = (select id from "proj-dashboard-users" where email = '...');


-- =====================================================================================================
-- 4. PROJECTS
-- status must be one of: planning, active, on_hold, completed, cancelled
-- =====================================================================================================
with p as (
  insert into "proj-dashboard-projects"
    (code, name, client_name, main_contractor, consultant, location, description, category,
     project_manager_id, status, progress, start_date, expected_completion, remarks)
  values
    ('PRJ-001', 'Project name', 'Client name', 'Main contractor', 'Consultant', 'City', 'Short description',
     'Building Construction',                                              -- any name from section 1a
     (select id from "proj-dashboard-users" where email = 'first.last@yourcompany.com'),
     'active', 0, '2026-01-01', '2027-06-30', null)
  returning id
), f as (
  insert into "proj-dashboard-project-financials" (project_id, contract_value, currency)
  select id, 1500000.00, 'SAR' from p
), m as (   -- the project manager is also a team member with full project rights
  insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_edit, can_upload, can_delete_docs, can_manage_team)
  select p.id, (select id from "proj-dashboard-users" where email = 'first.last@yourcompany.com'), 'manager', true, true, true, true from p
)
select id from p;

-- add / change team members (member_role: manager, engineer, member, viewer)
insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_upload)
values ((select id from "proj-dashboard-projects" where code = 'PRJ-001'),
        (select id from "proj-dashboard-users" where email = 'another.person@yourcompany.com'), 'engineer', true)
on conflict (project_id, user_id) do update set member_role = excluded.member_role, can_upload = excluded.can_upload;

-- update a project
--   update "proj-dashboard-projects" set status = 'completed', progress = 100, actual_completion = '2026-09-01' where code = 'PRJ-001';
--   update "proj-dashboard-project-financials" set contract_value = 1600000 where project_id = (select id from "proj-dashboard-projects" where code = 'PRJ-001');
-- soft-delete / restore (the portal's retention job removes soft-deleted projects and their files later):
--   update "proj-dashboard-projects" set deleted_at = now() where code = 'PRJ-001';
--   update "proj-dashboard-projects" set deleted_at = null  where code = 'PRJ-001';

-- NOTE: documents (PDFs) must be uploaded through the portal so the file is stored and linked to its revision history.
-- Do not insert rows into "proj-dashboard-documents" / "proj-dashboard-document-revisions" by hand.


-- =====================================================================================================
-- 5. REMOVE THE MOCK / DEMO DATA
-- Create your own Super Admin first (section 3 with role 'super_admin', or `npm run db:bootstrap`), sign in once to
-- confirm, then run:  npm run db:clear-demo   (it also deletes the demo PDF files from storage).
-- SQL-only version (leaves demo PDF files in storage, so the npm command is preferred):
--   delete from "proj-dashboard-notifications" where user_id in (select id from "proj-dashboard-users" where is_demo);
--   delete from "proj-dashboard-logs"     where is_demo;
--   delete from "proj-dashboard-projects" where is_demo;   -- cascades to members, financials, documents, revisions
--   delete from "proj-dashboard-users"    where is_demo;
-- =====================================================================================================
