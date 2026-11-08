import "server-only";
import { withUser, sysQuery, type Db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";
import { profileSchema, userCreateSchema, userUpdateSchema } from "@/lib/validators";
import { assertPerm, type SessionUser } from "@/server/session-user";
import { diff, logActivity } from "@/server/activity";
import { createResetToken } from "@/server/reset-token";
import { generateTempPassword, hashPassword } from "@/server/password";
import { sendMail } from "@/server/mail";

export type UserListItem = {
  id: string; email: string; username: string | null; fullName: string; department: string | null; jobTitle: string | null; phone: string | null;
  isActive: boolean; isDemo: boolean; lastLoginAt: string | null; createdAt: string; roleId: string | null; roleCode: string | null; roleName: string | null; projectCount: number;
};

function zerr(r: { error: { issues: { path: PropertyKey[]; message: string }[] } }): never {
  const fe: Record<string, string> = {};
  r.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
  throw new ValidationError("Please correct the highlighted fields.", fe);
}

const SORTS: Record<string, string> = { name: "u.full_name", email: "u.email", role: "r.name", status: "u.is_active", login: "u.last_login_at", created: "u.created_at" };

export async function listUsers(
  user: SessionUser,
  f: { q?: string; roleId?: string; status?: string; sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number } = {},
) {
  if (!hasPerm(user, PERMS.userView) && !hasPerm(user, PERMS.userManage)) throw new ForbiddenError();
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, f.pageSize ?? 10);
  const params: unknown[] = [];
  const add = (v: unknown) => (params.push(v), "$" + params.length);
  const w: string[] = ["true"];
  if (f.q) {
    const t = add("%" + f.q.replace(/[\\%_]/g, (m) => "\\" + m) + "%");
    w.push(`(u.full_name ilike ${t} or u.email ilike ${t} or u.username ilike ${t} or u.department ilike ${t})`);
  }
  if (f.roleId && /^[0-9a-f-]{36}$/i.test(f.roleId)) w.push(`r.id = ${add(f.roleId)}`);
  if (f.status === "active") w.push("u.is_active");
  if (f.status === "inactive") w.push("not u.is_active");
  const sort = SORTS[f.sort ?? "name"] ?? SORTS.name;
  const dir = f.dir === "desc" ? "desc" : "asc";
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select u.*, r.id as role_id, r.code as role_code, r.name as role_name,
              (select count(*)::int from "proj-dashboard-project-members" m where m.user_id = u.id) as project_count, count(*) over()::int as total
         from "proj-dashboard-users" u
         left join lateral (select r2.* from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r2 on r2.id = ur.role_id where ur.user_id = u.id order by r2.created_at limit 1) r on true
        where ${w.join(" and ")} order by ${sort} ${dir} nulls last, u.full_name limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    const items: UserListItem[] = r.rows.map((x) => ({
      id: x.id, email: x.email, username: x.username, fullName: x.full_name, department: x.department, jobTitle: x.job_title, phone: x.phone,
      isActive: x.is_active, isDemo: x.is_demo, lastLoginAt: x.last_login_at, createdAt: x.created_at, roleId: x.role_id, roleCode: x.role_code,
      roleName: x.role_name, projectCount: x.project_count,
    }));
    return { items, total: r.rows[0]?.total ?? 0, page, pageSize };
  });
}

export async function getUser(user: SessionUser, id: string): Promise<UserListItem> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundError();
  const r = await withUser(user.id, async (db) =>
    (await db.query(
      `select u.*, r.id as role_id, r.code as role_code, r.name as role_name, (select count(*)::int from "proj-dashboard-project-members" m where m.user_id = u.id) as project_count
         from "proj-dashboard-users" u left join lateral (select r2.* from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r2 on r2.id = ur.role_id where ur.user_id = u.id limit 1) r on true where u.id = $1`,
      [id],
    )).rows[0],
  );
  if (!r) throw new NotFoundError();
  return {
    id: r.id, email: r.email, username: r.username, fullName: r.full_name, department: r.department, jobTitle: r.job_title, phone: r.phone,
    isActive: r.is_active, isDemo: r.is_demo, lastLoginAt: r.last_login_at, createdAt: r.created_at, roleId: r.role_id, roleCode: r.role_code, roleName: r.role_name,
    projectCount: r.project_count,
  };
}

export async function listAllActiveUsers(user: SessionUser) {
  return withUser(user.id, async (db) =>
    (await db.query(
      `select u.id, u.full_name, u.email, u.department, (select r.code from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r on r.id = ur.role_id where ur.user_id = u.id limit 1) as role_code
         from "proj-dashboard-users" u where u.is_active order by u.full_name`,
    )).rows.map((x) => ({ id: x.id as string, name: x.full_name as string, email: x.email as string, department: x.department as string | null, roleCode: x.role_code as string | null })),
  );
}

async function roleCodeOf(db: Db, roleId: string) {
  const r = (await db.query(`select code, name from "proj-dashboard-roles" where id = $1`, [roleId])).rows[0];
  if (!r) throw new ValidationError("Selected role does not exist.", { roleId: "Select a role" });
  return r as { code: string; name: string };
}

async function otherActiveSuperAdmins(db: Db, excludingUserId: string) {
  return (await db.query(
    `select count(*)::int as n from "proj-dashboard-users" u join "proj-dashboard-user-roles" ur on ur.user_id = u.id join "proj-dashboard-roles" r on r.id = ur.role_id
      where r.code = 'super_admin' and u.is_active and u.id <> $1`,
    [excludingUserId],
  )).rows[0].n as number;
}

export type CreatedUser = { id: string; tempPassword: string | null; emailSent: boolean };

export async function createUser(actor: SessionUser, raw: unknown): Promise<CreatedUser> {
  assertPerm(actor, PERMS.userManage);
  const p = userCreateSchema.safeParse(raw);
  if (!p.success) zerr(p);
  const i = p.data;
  const tempPassword = i.password ? null : generateTempPassword();
  const hash = await hashPassword(i.password || (tempPassword as string));
  const id = await withUser(actor.id, async (db) => {
    const role = await roleCodeOf(db, i.roleId);
    if (role.code === "super_admin" && actor.roleCode !== "super_admin") throw new ForbiddenError("Only a Super Admin can create another Super Admin.");
    const r = await db.query(
      `insert into "proj-dashboard-users" (email, username, full_name, department, job_title, phone, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$7) returning id`,
      [i.email, i.username || null, i.fullName, i.department || null, i.jobTitle || null, i.phone || null, actor.id],
    );
    const uid = r.rows[0].id as string;
    await db.query(`insert into "proj-dashboard-user-roles" (user_id, role_id, created_by) values ($1,$2,$3)`, [uid, i.roleId, actor.id]);
    // password is always flagged "must change" on first login (admin-set credentials)
    await db.query(`select app_set_password($1, $2, true)`, [uid, hash]);
    await logActivity(db, actor, { action: "user.create", entityType: "user", entityId: uid, summary: `Created user ${i.fullName} (${i.email}) with role ${role.name}`, next: { email: i.email, role: role.code } });
    return uid;
  });
  const mail = await sendMail(
    i.email,
    "Your RVCC Portal account",
    `Hello ${i.fullName},\n\nAn account was created for you.\nSign in at ${process.env.APP_URL || "http://localhost:3000"}/login with this e-mail address.\n` +
      (tempPassword ? `Temporary password: ${tempPassword}\n` : "Use the password provided by your administrator.\n") +
      `You will be asked to choose a new password at first sign-in.`,
  ).catch(() => ({ sent: false }));
  return { id, tempPassword, emailSent: mail.sent };
}

export async function updateUser(actor: SessionUser, id: string, raw: unknown) {
  assertPerm(actor, PERMS.userManage);
  const p = userUpdateSchema.safeParse(raw);
  if (!p.success) zerr(p);
  const i = p.data;
  return withUser(actor.id, async (db) => {
    const cur = (await db.query(
      `select u.*, r.id as role_id, r.code as role_code, r.name as role_name from "proj-dashboard-users" u
         left join lateral (select r2.* from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r2 on r2.id = ur.role_id where ur.user_id = u.id limit 1) r on true where u.id = $1`,
      [id],
    )).rows[0];
    if (!cur) throw new NotFoundError();
    const newRole = await roleCodeOf(db, i.roleId);
    if ((cur.role_code === "super_admin" || newRole.code === "super_admin") && actor.roleCode !== "super_admin")
      throw new ForbiddenError("Only a Super Admin can change Super Admin accounts or grant that role.");
    const losingAdmin = cur.role_code === "super_admin" && (newRole.code !== "super_admin" || !i.isActive);
    if (losingAdmin && (await otherActiveSuperAdmins(db, id)) === 0) throw new ConflictError("At least one active Super Admin must remain.");
    if (id === actor.id && !i.isActive) throw new ConflictError("You cannot deactivate your own account.");
    if (id === actor.id && newRole.code !== actor.roleCode) throw new ConflictError("You cannot change your own role.");

    const changes = { email: i.email, username: i.username || null, full_name: i.fullName, department: i.department || null, job_title: i.jobTitle || null, phone: i.phone || null, is_active: i.isActive };
    const d = diff(cur, changes);
    const roleChanged = cur.role_id !== i.roleId;
    if (!d.changed.length && !roleChanged) return { id, changed: [] as string[] };
    const u = await db.query(
      `update "proj-dashboard-users" set email = $2, username = $3, full_name = $4, department = $5, job_title = $6, phone = $7, is_active = $8, updated_by = $9 where id = $1`,
      [id, changes.email, changes.username, changes.full_name, changes.department, changes.job_title, changes.phone, changes.is_active, actor.id],
    );
    if (u.rowCount === 0) throw new ForbiddenError();
    if (roleChanged) {
      await db.query(`delete from "proj-dashboard-user-roles" where user_id = $1`, [id]);
      await db.query(`insert into "proj-dashboard-user-roles" (user_id, role_id, created_by) values ($1,$2,$3)`, [id, i.roleId, actor.id]);
      d.previous.role = cur.role_name;
      d.next.role = newRole.name;
      d.changed.push("role");
    }
    if (!i.isActive || roleChanged) await db.query(`select app_revoke_sessions($1)`, [id]); // force re-login with fresh rights
    await logActivity(db, actor, {
      action: roleChanged ? "user.role_change" : d.changed.includes("is_active") ? (i.isActive ? "user.activate" : "user.deactivate") : "user.update",
      entityType: "user", entityId: id, summary: `Updated user ${i.fullName}: ${d.changed.join(", ")}`, previous: d.previous, next: d.next,
    });
    return { id, changed: d.changed };
  });
}

export async function deleteUser(actor: SessionUser, id: string) {
  assertPerm(actor, PERMS.userManage);
  if (id === actor.id) throw new ConflictError("You cannot delete your own account.");
  return withUser(actor.id, async (db) => {
    const cur = (await db.query(
      `select u.full_name, u.email, r.code as role_code from "proj-dashboard-users" u left join lateral (select r2.* from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r2 on r2.id = ur.role_id where ur.user_id = u.id limit 1) r on true where u.id = $1`,
      [id],
    )).rows[0];
    if (!cur) throw new NotFoundError();
    if (cur.role_code === "super_admin") {
      if (actor.roleCode !== "super_admin") throw new ForbiddenError("Only a Super Admin can delete a Super Admin.");
      if ((await otherActiveSuperAdmins(db, id)) === 0) throw new ConflictError("At least one active Super Admin must remain.");
    }
    const pm = (await db.query(`select count(*)::int as n from "proj-dashboard-projects" where project_manager_id = $1 and deleted_at is null`, [id])).rows[0].n;
    if (pm > 0) throw new ConflictError(`This user is the project manager of ${pm} project(s). Reassign those projects first, or deactivate the account instead.`);
    const d = await db.query(`delete from "proj-dashboard-users" where id = $1`, [id]);
    if (d.rowCount === 0) throw new ForbiddenError();
    await logActivity(db, actor, { action: "user.delete", entityType: "user", entityId: null, summary: `Deleted user ${cur.full_name} (${cur.email})`, previous: { email: cur.email } });
  });
}

/** Admin-triggered reset: generates a one-time link (shown to the admin and e-mailed when SMTP is configured). */
export async function adminResetPassword(actor: SessionUser, id: string) {
  assertPerm(actor, PERMS.userManage);
  const u = (await sysQuery(`select email, full_name, is_active from "proj-dashboard-users" where id = $1`, [id])).rows[0];
  if (!u) throw new NotFoundError();
  if (!u.is_active) throw new ConflictError("Activate the account before sending a password reset.");
  const { url } = await createResetToken(id);
  const mail = await sendMail(u.email, "Reset your RVCC Portal password", `Hello ${u.full_name},\n\nAn administrator requested a password reset for your account. Use this one-time link (valid 1 hour):\n\n${url}\n`);
  await withUser(actor.id, (db) =>
    logActivity(db, actor, { action: "user.password_reset_request", entityType: "user", entityId: id, summary: `Password reset link issued for ${u.full_name}` }),
  );
  return { url, emailSent: mail.sent };
}

export async function updateOwnProfile(user: SessionUser, raw: unknown) {
  const p = profileSchema.safeParse(raw);
  if (!p.success) zerr(p);
  const i = p.data;
  return withUser(user.id, async (db) => {
    const u = await db.query(`update "proj-dashboard-users" set full_name = $2, department = $3, job_title = $4, phone = $5, updated_by = $1 where id = $1`, [
      user.id, i.fullName, i.department || null, i.jobTitle || null, i.phone || null,
    ]);
    if (u.rowCount === 0) throw new NotFoundError();
    await logActivity(db, user, { action: "user.profile_update", entityType: "user", entityId: user.id, summary: "Updated own profile", next: i });
  });
}
