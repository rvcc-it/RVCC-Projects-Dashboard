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
