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
