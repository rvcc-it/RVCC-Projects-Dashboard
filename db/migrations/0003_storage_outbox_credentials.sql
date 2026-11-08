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
