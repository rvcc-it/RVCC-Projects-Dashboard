-- =====================================================================================================
-- Users: the 6 project managers from the project sheet. Run in the Supabase SQL editor AFTER docs/SUPABASE-SETUP.sql.
-- 1. Replace each e-mail below with the person's REAL e-mail (lower-case). The ones shown are placeholders.
-- 2. Everyone gets the temporary password below and must choose their own at first sign-in.
-- 3. Safe to re-run: people whose e-mail already exists are skipped.
-- Plain PostgreSQL (not Supabase): run  create extension if not exists pgcrypto;  once and remove "extensions." below.
-- Roles: super_admin, management, project_manager, engineer, viewer  (change the role column per person if needed).
-- =====================================================================================================
create temp table new_users (email text, full_name text, department text, job_title text, role_code text) on commit drop;
insert into new_users values
  ('qais@rvce.com.sa',       'Qais Hossam',      'Projects', 'Project Manager', 'project_manager'),
  ('bala@rvce.com.sa',   'Balaprassanna P.', 'Projects', 'Project Manager', 'project_manager'),
  ('omprasad@rvce.com.sa',      'Omprasad Raj',     'Projects', 'Project Manager', 'project_manager'),
  ('ebengeorge@rvce.com.sa',       'Eben George',      'Projects', 'Project Manager', 'project_manager'),
  ('abdullah.khan@rvce.com.sa',     'Abdullah Khan',    'Projects', 'Project Manager', 'project_manager');

with ins as (
  insert into "proj-dashboard-users" (email, full_name, department, job_title)
  select lower(email), full_name, department, job_title from new_users
  on conflict do nothing
  returning id, email
), r as (
  insert into "proj-dashboard-user-roles" (user_id, role_id)
  select ins.id, (select id from "proj-dashboard-roles" where code = n.role_code)
    from ins join new_users n on lower(n.email) = ins.email
), c as (
  insert into "proj-dashboard-user-credentials" (user_id, password_hash, must_change_password)
  select ins.id, extensions.crypt('Welcome#Rvcc-2026', extensions.gen_salt('bf', 12)), true from ins
)
select email, 'created' as result from ins;

-- check:
--   select u.email, u.full_name, r.code, u.is_active from "proj-dashboard-users" u
--     join "proj-dashboard-user-roles" ur on ur.user_id = u.id join "proj-dashboard-roles" r on r.id = ur.role_id order by u.full_name;
--
-- Then, in docs/PROJECTS-INSERT.sql steps 3-4, set the same e-mails in pm_map so each project gets its manager.
-- Add more people: copy a row in the VALUES list. Reset someone's password / deactivate: see docs/DATA-QUERIES.sql section 3.
