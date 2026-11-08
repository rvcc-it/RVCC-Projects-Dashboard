// Creates the first Super Admin from BOOTSTRAP_ADMIN_* env vars (production first-deploy step).
// Refuses to run when any non-demo user already exists. Usage: npm run db:bootstrap
import "./env";
import { sys } from "../src/lib/db";
import { hashPassword } from "../src/server/password";
import { passwordSchema } from "../src/lib/validators";


async function main() {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
  const name = (process.env.BOOTSTRAP_ADMIN_NAME || "System Administrator").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  if (!email.includes("@")) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL");
  const ok = passwordSchema.safeParse(password);
  if (!ok.success) throw new Error("BOOTSTRAP_ADMIN_PASSWORD: " + ok.error.issues[0].message);
  const hash = await hashPassword(password);
  await sys(async (db) => {
    const n = (await db.query(`select count(*)::int as n from "proj-dashboard-users" where not is_demo`)).rows[0].n;
    if (n > 0) throw new Error("A real user already exists – bootstrap is only for the first admin.");
    const u = await db.query(`insert into "proj-dashboard-users" (email, full_name) values ($1,$2) returning id`, [email, name]);
    const role = await db.query(`select id from "proj-dashboard-roles" where code = 'super_admin'`);
    await db.query(`insert into "proj-dashboard-user-roles" (user_id, role_id) values ($1,$2)`, [u.rows[0].id, role.rows[0].id]);
    await db.query(`insert into "proj-dashboard-user-credentials" (user_id, password_hash, must_change_password) values ($1,$2,true)`, [u.rows[0].id, hash]);
  });
  console.log(`Super Admin created: ${email}. You must change the password at first sign-in.`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
