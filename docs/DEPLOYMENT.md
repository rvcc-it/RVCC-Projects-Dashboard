# Deployment

The app is a standard Next.js server + PostgreSQL + a private file store. Pick one of the two reference setups.

## A. Company VPS (recommended – local disk storage works)

1. **PostgreSQL 14+ (UTF-8)**. Create a database and a login role that owns it:
   ```sql
   CREATE ROLE portal LOGIN PASSWORD '…strong…';
   CREATE DATABASE rvcc_portal OWNER portal ENCODING 'UTF8' TEMPLATE template0;
   ```
   The migration `GRANT`s the internal `app_authenticated` role to this owner; at run-time every request switches to that non-owner role so RLS is enforced. (The portal's login role therefore must **not** be a PostgreSQL superuser with `BYPASSRLS` concerns — it does not matter for RLS because `SET LOCAL ROLE` is used, but least privilege is still better.)
2. **Configure** – copy `.env.example` to `.env.production` / process env:
   * `DATABASE_URL=postgresql://portal:…@127.0.0.1:5432/rvcc_portal`
   * `APP_URL=https://portal.example.com`
   * `SESSION_COOKIE_SECURE=true` (HTTPS is mandatory in production)
   * `STORAGE_DRIVER=local`, `STORAGE_LOCAL_DIR=/var/lib/rvcc-portal/files` (outside the repo/webroot, owned by the app user, **backed up**)
   * `SMTP_*` for password-reset e-mail, `CRON_SECRET=<long random>`
3. **Build & migrate**
   ```bash
   npm ci
   npm run build
   npm run db:migrate
   BOOTSTRAP_ADMIN_EMAIL=you@company.com BOOTSTRAP_ADMIN_PASSWORD='…' npm run db:bootstrap   # first admin only, password must be changed at first sign-in
   ```
   Do **not** run `test:seed` in production. Enter real data via the portal or `docs/DATA-QUERIES.sql`.
4. **Run** behind nginx/Caddy with TLS: `npm run start -- -p 3000` (use systemd/pm2). Make sure the proxy allows request bodies > your *Maximum PDF size* (e.g. nginx `client_max_body_size 60m;`) and forwards `Host`/`X-Forwarded-*` headers.
5. **Retention job** – daily cron:
   ```
   0 3 * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://portal.example.com/api/maintenance/purge
   ```
6. **Health check**: `GET /api/health`.

## B. Vercel + Supabase (or any managed Postgres + S3)

* Database: Supabase *direct* or *session-pooler* connection string → `DATABASE_URL`, `DATABASE_SSL=true`. Apply migrations from your machine/CI: `npm run db:migrate`. Transaction-pooler also works (all session state is `SET LOCAL`).
* Storage: Vercel's disk is ephemeral → `STORAGE_DRIVER=s3` with `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (and `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE=true` for Supabase Storage's S3 endpoint). **The bucket must be private.** (Adapter is implemented but not validated against a live bucket in this repo's tests.)
* `vercel.json` cron for retention (Vercel sends GET; the route accepts it with the `Authorization: Bearer $CRON_SECRET` header that Vercel adds when `CRON_SECRET` is set):
  ```json
  { "crons": [{ "path": "/api/maintenance/purge", "schedule": "0 3 * * *" }] }
  ```
* Vercel request bodies are limited (~4.5 MB on serverless functions) — large PDF uploads therefore need a VPS (or a presigned-upload variant). Prefer option A for the 50 MB default.

## Operations checklist
* Back up **both** the database and the file store together.
* Rotate `CRON_SECRET`; keep `.env*` out of git (they are in `.gitignore`).
* Review *Users & Access → Roles & permissions* after go-live and reduce permissions to what each role needs.
* Error monitoring: add Sentry (`@sentry/nextjs`) and set `SENTRY_DSN` if required; server errors are already logged with `console.error`.
