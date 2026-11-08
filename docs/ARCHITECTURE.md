# Architecture

## 1. Layers

```
Browser ── React Server Components / Client Components (shadcn/ui, Recharts, react-pdf)
   │  forms: React Hook Form + Zod (same schemas as the server)
   ▼
Next.js server
   proxy.ts            optimistic redirect to /login (cookie *exists* only)
   app/api/*           route handlers: auth, uploads (multipart), secure file streaming, exports, search
   src/actions/*       "use server" wrappers → safe() = authenticate + typed result + revalidate
   src/server/services business logic. Each function: Zod-validate → check permission → withUser(tx) → audit + notify
   src/server/storage  StorageAdapter (local disk | S3-compatible) – private only
   ▼
PostgreSQL
   RLS policies + SECURITY DEFINER helper functions + guard triggers   ← the real security boundary
```

All database access is in `src/server/**`. `src/lib/db.ts` exposes exactly two entry points:

* `withUser(userId, fn)` – transaction; `SET LOCAL ROLE app_authenticated`; `set_config('app.user_id')`. **RLS applies.** All business queries use this.
* `sys(fn)` / `sysQuery()` – trusted owner context for authentication, sessions, retention job and seeding only.

## 2. Database schema (migrations `db/migrations`)

| Table | Purpose |
|---|---|
| `users` | profile, `is_active`, `is_demo`; `email` unique (lower-case), optional `username` |
| `user_credentials` | bcrypt hash, `must_change_password` — **no grants to the app role** |
| `sessions`, `password_reset_tokens`, `login_attempts` | token **hashes** only; no grants to the app role |
| `roles`, `permissions`, `role_permissions`, `user_roles` | configurable RBAC (24 permission codes, 5 built-in roles + custom roles) |
| `projects` | code (unique, auto `PRJ-YYYY-NNNN`), client, location, category, manager, status, progress, dates, `is_archived`, `deleted_at` (soft delete), cover key |
| `project_financials` | contract value in its **own table** so it has its own RLS policy |
| `project_members` | per-project role + flags: `can_edit`, `can_upload`, `can_delete_docs`, `can_manage_team` |
| `document_categories` | configurable, `is_active`, `sort_order` |
| `project_documents` | metadata, `current_revision_no`, soft delete (`deleted_at`, `deleted_by`) |
| `document_revisions` | one row per uploaded file: `storage_key`, size, SHA-256, label, notes. **Immutable** (trigger) — revisions are never overwritten |
| `notifications` | per user |
| `activity_logs` | append-only audit: actor name snapshot, action, project/document, previous & new JSON |
| `saved_filters` | per-user slicer combinations |
| `app_settings` | `retention_days`, `max_upload_mb` |
| `storage_deletions` | **outbox** for file removal (see §5) |

Every table has UUID PKs, FKs with explicit `ON DELETE` rules, check constraints (status enum, progress 0-100, date order, positive file size),
`created_at/updated_at` (+ `created_by/updated_by` where meaningful, maintained by trigger/service), and indexes on all filtered/sorted columns
(status, location, manager, client, category, dates, FK columns, GIN full-text on project/document names).

## 3. RBAC + RLS

### Permission model
* **Global permissions** (role → permission, editable in *Users & Access → Roles & permissions*): e.g. `project.view_all`, `project.update_assigned`, `document.upload_assigned`, `document.download`, `report.export`, `user.manage` …
* **Project-level flags** on `project_members` narrow the `*_assigned` permissions to the projects a user is a member of.
* `super_admin` is hard-wired inside `app_has_perm()` so the system can never be locked out.

| Role (default) | Sees | Can do |
|---|---|---|
| Super Admin | everything | everything |
| Management | all projects/documents/reports/audit, contract value | read-only + export + save filters |
| Project Manager | assigned projects | edit assigned project, manage its team, upload/delete its documents, project reports |
| Engineer / Staff | assigned projects | upload where the member flag allows, download, reports |
| Viewer | assigned projects | read + download |

### Enforcement points (defence in depth)
1. **PostgreSQL RLS** (`0002_rbac_rls.sql`): policies on every table call `app_can_view_project()`, `app_can_edit_project()`, `app_can_upload()`, `app_can_delete_doc()`, `app_can_manage_team()`, `app_has_perm()` (SECURITY DEFINER, `search_path` pinned).
2. **Guard triggers** for column-level rules RLS cannot express: only `project.delete` may set `deleted_at`; only `project.assign_manager` may change the manager; only user-managers may (de)activate accounts; revision files are immutable; document deletion needs the delete right.
3. **Services**: Zod validation + explicit permission checks (clear 403 messages) + business safeguards (cannot delete/deactivate yourself, last Super Admin protected, project with documents cannot be deleted — archive instead, category in use needs reassignment, …).
4. **Route handlers**: authenticate, same-origin check on mutating requests, `Cache-Control: private, no-store` on files.
5. **UI**: hides unavailable actions using the *same* SQL functions (`caps` are computed by `app_can_*()` in the query), but is never the control.

## 4. Authentication
* bcrypt (cost 12), constant-time-ish login (dummy hash when the account does not exist), identical messages for unknown account / wrong password / inactive.
* Opaque 256-bit session token in an **httpOnly, SameSite=Lax** cookie; only its SHA-256 is stored. 12 h session, 30 days with “Remember me”.
* Lock-out: 5 failed attempts / 15 min per identifier.
* Password reset: single-use, 1-hour, hashed token; all sessions are revoked on reset/role change/deactivation.
* Admin-created accounts get a generated temporary password (shown once) and **must change it** at first sign-in.

## 5. Documents & retention
* Key layout: `documents/<projectId>/<documentId>/<revisionId>.pdf`. Never served statically.
* Upload validation on the server: extension, size (setting), `%PDF-` signature; stored with SHA-256; file written inside the DB transaction and removed if the transaction fails.
* New revision = new file + new row; previous files stay downloadable.
* **Delete** = soft delete (access revoked immediately, restorable). **Retention job** (`POST /api/maintenance/purge`, or *Settings → System*) permanently deletes documents trashed longer than `retention_days`: in *one transaction* it inserts every file key into `storage_deletions` and deletes the rows; files are then removed and the outbox entry cleared. Failures stay in the outbox and are retried by the next run ⇒ **no orphaned files and no dangling rows**.

## 6. Dashboard / filters
Filters are a single model (`src/lib/filters.ts`) serialised in the URL (shareable, back-button friendly). The server turns it into a parameterised `WHERE` (no string interpolation of user input) used by **every** KPI, chart, table and report query, so cross-filtering is exact. Chart slices/bars are clickable and add the corresponding filter.

“Requires attention” = on hold, **or** overdue (`expected_completion < today`, still open), **or** active and more than 25 progress-points behind elapsed schedule.

## 7. Audit & notifications
Every mutation writes `activity_logs` in the same transaction (user, action, project, document, previous/new values). Notifications are written for: project created, user assigned/removed, project updated, status changed, document uploaded, new revision. Audit rows are append-only (no UPDATE/DELETE policy or grant).
