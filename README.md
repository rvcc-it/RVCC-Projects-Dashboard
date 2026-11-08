# RVCC Projects & Documents Portal

Project-management dashboard and private PDF document portal for a construction & contracting company.
Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · PostgreSQL · Recharts · React Hook Form + Zod · react-pdf.

* Secure login (bcrypt, httpOnly session cookies, lock-out, password reset) — **no hard-coded credentials**
* Role-based access control that is **configurable in the UI** and **enforced in PostgreSQL (Row Level Security)**, in the server layer and in the UI
* Executive dashboard with Power BI-style slicers (cross-filtering KPIs, 7 charts and the table from real SQL)
* Full CRUD for projects, teams, users, roles, document categories, documents and revisions
* Private PDF storage, embedded viewer, revision history, soft-delete + retention policy with zero orphaned files
* Reports with PDF / Excel / CSV export, notifications, append-only audit log with previous → new values

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (schema, RBAC/RLS design, security) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Quick start (local, no Docker needed)

Requirements: Node.js 20+ (developed on 26), npm.

```bash
npm install
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local

npm run db:local                  # terminal 1 – starts an embedded PostgreSQL (UTF-8) on port 54329, data in ./.pgdata
npm run db:migrate                # terminal 2 – applies db/migrations/*.sql
BOOTSTRAP_ADMIN_EMAIL=you@company.com BOOTSTRAP_ADMIN_PASSWORD='…' npm run db:bootstrap   # first Super Admin (must change password at first sign-in)
npm run dev                       # http://localhost:3000   (use `npm run dev -- -p 3001` if 3000 is taken)
```

The app ships with **no business data**: only roles, permissions, document categories and project categories (all editable). Enter your real data from the portal, or with the ready-made SQL in [`docs/DATA-QUERIES.sql`](docs/DATA-QUERIES.sql) (categories, roles, users, projects, team members, settings).

Mock data for the automated tests lives in `tests/fixtures/seed-demo.ts` (`npm run test:seed`, flagged `is_demo = true`). **Never run it in production.** To remove it from a database: `npm run db:clear-demo` (refuses to run until a real Super Admin exists).

### Table names

All tables are prefixed so the portal can share a database (e.g. one Supabase project) with other apps:
`proj-dashboard-users`, `proj-dashboard-logs` (audit trail), `proj-dashboard-projects`, `proj-dashboard-documents`, `proj-dashboard-document-revisions`,
`proj-dashboard-roles`, `proj-dashboard-permissions`, `proj-dashboard-notifications`, … (21 in total; list them with `\dt`). The hyphens mean the names must be double-quoted in hand-written SQL.
Roles/functions (`app_authenticated`, `app_*`) are database-wide.

### Using an existing PostgreSQL / Supabase

Set `DATABASE_URL` (and `DATABASE_SSL=true` for managed databases) and run `npm run db:migrate`.
The database **must be UTF-8** (the migration runner refuses otherwise).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:local` | embedded dev PostgreSQL |
| `npm run db:migrate` | apply SQL migrations (idempotent, tracked in `schema_migrations`) |
| `npm run db:clear-demo` | delete mock/demo records and their PDFs (needs a real Super Admin first) |
| `npm run test:seed` | load mock data for the test suites (test databases only) |
| `npm run db:bootstrap` | create first Super Admin from `BOOTSTRAP_ADMIN_*` env vars |
| `npm test` | 43 integration tests against real PostgreSQL + RLS + file storage |
| `npm run test:e2e` | 22-step browser test (Playwright) against a running server |
| `npm run typecheck` · `npm run lint` | static checks |

E2E notes: `BASE_URL=http://localhost:3000 CHROME_PATH="<path to chrome.exe>" npm run test:e2e` (Playwright is installed without browsers; point it at any Chromium/Chrome).

## Project layout

```
db/migrations/        0001 schema · 0002 RBAC + RLS policies · 0003 credentials + storage outbox · 0004 revision policy · 0005 notification author · 0006 Supabase lock-down · 0007 project categories table
src/app/(auth)/       login, forgot/reset password
src/app/(app)/        overview, projects, documents, reports, users, notifications, settings
src/app/api/          auth, document upload/serve, cover images, report export, search, health, retention job
src/server/           auth/session, services (all business logic + SQL), storage adapters, exports, audit/notify
src/actions/          thin "use server" wrappers (authenticate → service → typed result)
src/lib/              validators (Zod, shared with the browser), filters model, db access, errors
src/components/       layout shell, dashboard, projects, documents, users, settings, shadcn/ui
scripts/              migrate, seed, bootstrap, dev database
tests/                services.test.ts (integration) · e2e/ (browser)
```

## Security model in one paragraph

Every request is authenticated from a hashed session token. Business queries run inside a transaction that executes
`SET LOCAL ROLE app_authenticated` and `set_config('app.user_id', …)`; that role is **not** an owner/superuser, so PostgreSQL RLS policies
(which call `app_has_perm()` / `app_can_*()` helper functions that read the role–permission tables and project membership) decide what can
be read or changed — even if application code had a bug. Credentials, sessions and reset tokens have **no grants** for that role.
Services additionally validate with Zod and check permissions for clear error messages; the UI hides what you cannot do (but is never trusted).
Documents live in private storage and are only streamed by `/api/documents/:id/file` after a permission check — there is no public URL.

## Known limitations (honest list)

* Visibility is **project-level**: if you can see a project you can see all of its (non-deleted) documents; there is no per-document ACL.
* *Preview* needs only project access; *download* additionally needs `document.download`. A user who can preview can technically capture the rendered PDF (inherent to any viewer).
* E-mail (password reset / invitations) uses SMTP via `SMTP_*`; without it the link is printed in the **server console** and, for admin-triggered resets, shown to the admin. SMTP delivery itself was not exercised in this environment.
* The S3 storage adapter (`STORAGE_DRIVER=s3`, also works with the Supabase Storage S3 endpoint) is implemented but was **not** tested against a live bucket; the local-disk adapter is what the test-suite covers. Local disk is not suitable for serverless hosts such as Vercel — use S3 there.
* Login lock-out (5 failures / 15 min per identifier) is the only rate limiting; put a WAF / reverse-proxy limit in front for production.
* Sentry is not wired in (no DSN available); `SENTRY_DSN` is reserved in `.env.example`.
* The company logo is a placeholder SVG (`src/components/layout/logo.tsx`).
* Not run against an actual Supabase project (Supabase-compatible by design: plain SQL + `pg`; auth is the portal's own, not Supabase Auth).
