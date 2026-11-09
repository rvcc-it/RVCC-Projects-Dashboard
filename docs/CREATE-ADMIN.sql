-- Creates the Super Admin it.support@rvce.com.sa. Run in the Supabase SQL editor AFTER docs/SUPABASE-SETUP.sql.
-- Temporary password: Rv#8kQ2mT-wX5pL9   (the portal forces a new password at first sign-in)
-- Plain PostgreSQL (not Supabase): run  create extension if not exists pgcrypto;  once and remove "extensions." below.
with u as (
  insert into "proj-dashboard-users" (email, full_name, department, job_title)
  values ('it.support@rvce.com.sa', 'IT Support', 'IT & Administration', 'System Administrator')
  returning id
), r as (
  insert into "proj-dashboard-user-roles" (user_id, role_id)
  select u.id, (select id from "proj-dashboard-roles" where code = 'super_admin') from u
), c as (
  insert into "proj-dashboard-user-credentials" (user_id, password_hash, must_change_password)
  select u.id, extensions.crypt('Rv#8kQ2mT-wX5pL9', extensions.gen_salt('bf', 12)), true from u
)
select id, 'created' as result from u;

-- check:
--   select u.email, r.code, u.is_active from "proj-dashboard-users" u
--     join "proj-dashboard-user-roles" ur on ur.user_id = u.id join "proj-dashboard-roles" r on r.id = ur.role_id
--    where u.email = 'it.support@rvce.com.sa';
