-- Notifications may only be created in the caller's own name (prevents forged notifications at the database level).
drop policy if exists notif_insert on "proj-dashboard-notifications";
create policy notif_insert on "proj-dashboard-notifications" for insert to app_authenticated
  with check (app_uid() is not null and created_by = app_uid());
