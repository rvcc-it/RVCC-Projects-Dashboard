// Applies SQL files in db/migrations (alphabetical) that have not yet been applied.
// Usage: npm run db:migrate        (uses DATABASE_URL from .env.local / .env / environment)
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const dir = path.resolve("db/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
await client.connect();
const enc = (await client.query("show server_encoding")).rows[0].server_encoding;
if (enc !== "UTF8") { console.error(`Database encoding is ${enc}; the portal requires UTF8. Re-create the database with ENCODING 'UTF8'.`); process.exit(1); }
await client.query(`create table if not exists "proj-dashboard-migrations" (name text primary key, applied_at timestamptz not null default now())`);
const done = new Set((await client.query(`select name from "proj-dashboard-migrations"`)).rows.map((r) => r.name));
for (const f of files) {
  if (done.has(f)) continue;
  process.stdout.write(`Applying ${f} ... `);
  try {
    await client.query("begin");
    await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
    await client.query(`insert into "proj-dashboard-migrations"(name) values ($1)`, [f]);
    await client.query("commit");
    console.log("ok");
  } catch (e) {
    await client.query("rollback");
    console.log("FAILED\n" + e.message);
    process.exit(1);
  }
}
console.log("Migrations up to date.");
await client.end();
