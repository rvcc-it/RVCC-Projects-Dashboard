// Removes ALL mock/demo records (is_demo = true) and their stored PDF files, so only real data remains.
// Safety: refuses to run unless a real (non-demo) active Super Admin exists, otherwise nobody could log in afterwards.
// Usage: npm run db:clear-demo
import "./env";
import { sys } from "../src/lib/db";
import { getStorage } from "../src/server/storage";

async function main() {
  const storage = getStorage();
  const keys = await sys(async (db) => {
    const admin = await db.query(
      `select count(*)::int as n from "proj-dashboard-users" u
        join "proj-dashboard-user-roles" ur on ur.user_id = u.id join "proj-dashboard-roles" r on r.id = ur.role_id
       where not u.is_demo and u.is_active and r.code = 'super_admin'`,
    );
    if (admin.rows[0].n === 0)
      throw new Error("No real Super Admin found. Create one first (npm run db:bootstrap, or docs/DATA-QUERIES.sql section 3), then run this again.");
    const k = (await db.query(`select storage_key from "proj-dashboard-document-revisions" where is_demo`)).rows.map((r) => r.storage_key as string);
    const c = (await db.query(`select cover_key from "proj-dashboard-projects" where is_demo and cover_key is not null`)).rows.map((r) => r.cover_key as string);
    await db.query(`delete from "proj-dashboard-notifications" where user_id in (select id from "proj-dashboard-users" where is_demo)`);
    await db.query(`delete from "proj-dashboard-logs" where is_demo`);
    await db.query(`delete from "proj-dashboard-projects" where is_demo`); // cascades members, financials, documents, revisions
    await db.query(`delete from "proj-dashboard-users" where is_demo`);
    return [...k, ...c];
  });
  for (const k of keys) await storage.delete(k).catch(() => undefined);
  console.log(`Demo data removed (${keys.length} stored files deleted).`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
