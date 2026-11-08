import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { sys, sysQuery } from "@/lib/db";
import { AppError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { dummyHash, hashPassword, randomToken, sha256, verifyPassword } from "@/server/password";
export { requestPasswordReset, resetPasswordWithToken } from "@/server/reset-token";
import { loadSessionUser, type SessionUser } from "@/server/session-user";

export type { SessionUser };

export const SESSION_COOKIE = "rvcc_session";

async function clientMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, ua: h.get("user-agent")?.slice(0, 250) ?? null };
}

/** Resolve the signed-in user from the session cookie (cached per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await sysQuery(`select user_id from "proj-dashboard-sessions" where token_hash = $1 and expires_at > now()`, [sha256(token)]);
  if (!rows[0]) return null;
  return loadSessionUser(rows[0].user_id);
});

/** For route handlers and server actions: throws 401 instead of redirecting. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError();
  return u;
}

/** For pages/layouts: redirects to the login page. */
export async function requirePageUser(opts?: { allowMustChange?: boolean }): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword && !opts?.allowMustChange) redirect("/change-password");
  return u;
}

export async function createSession(userId: string, remember: boolean) {
  const token = randomToken();
  const days = Number(process.env.SESSION_REMEMBER_DAYS || 30);
  const hours = Number(process.env.SESSION_HOURS || 12);
  const ms = remember ? days * 86400_000 : hours * 3600_000;
  const expires = new Date(Date.now() + ms);
  const { ip, ua } = await clientMeta();
  await sysQuery(
    `insert into "proj-dashboard-sessions" (user_id, token_hash, remember, user_agent, ip, expires_at) values ($1,$2,$3,$4,$5,$6)`,
    [userId, sha256(token), remember, ua, ip, expires],
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    ...(remember ? { expires } : {}),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sysQuery(`delete from "proj-dashboard-sessions" where token_hash = $1`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function login(identifier: string, password: string, remember: boolean) {
  const id = identifier.trim().toLowerCase();
  const { ip } = await clientMeta();
  const failed = await sysQuery<{ n: number }>(
    `select count(*)::int as n from "proj-dashboard-login-attempts" where identifier = $1 and success = false and created_at > now() - ($2 || ' minutes')::interval`,
    [id, String(LOCK_MINUTES)],
  );
  if (failed.rows[0].n >= MAX_FAILED)
    throw new AppError(`Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`, 429, "rate_limited");

  const { rows } = await sysQuery(
    `select u.id, u.is_active, c.password_hash from "proj-dashboard-users" u left join "proj-dashboard-user-credentials" c on c.user_id = u.id
      where u.email = $1 or u.username = $1`,
    [id],
  );
  const row = rows[0];
  const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash()));
  if (!row || !row.password_hash || !ok || !row.is_active) {
    await sysQuery(`insert into "proj-dashboard-login-attempts" (identifier, ip, success) values ($1,$2,false)`, [id, ip]);
    throw new AppError("Invalid credentials, or the account is inactive.", 401, "invalid_credentials");
  }
  const user = await loadSessionUser(row.id);
  if (!user) throw new AppError("This account has no role assigned. Contact an administrator.", 403, "no_role");

  await sysQuery(`insert into "proj-dashboard-login-attempts" (identifier, ip, success) values ($1,$2,true)`, [id, ip]);
  await sysQuery(`delete from "proj-dashboard-login-attempts" where identifier = $1 and success = false`, [id]);
  await sysQuery(`update "proj-dashboard-users" set last_login_at = now() where id = $1`, [user.id]);
  await sysQuery(`delete from "proj-dashboard-sessions" where expires_at < now()`);
  await createSession(user.id, remember);
  await sysQuery(
    `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, summary, ip) values ($1,$2,'auth.login','user',$1,$3,$4)`,
    [user.id, user.fullName, `${user.fullName} signed in`, ip],
  );
  return user;
}

export async function changeOwnPassword(user: SessionUser, current: string, next: string) {
  const { rows } = await sysQuery(`select password_hash from "proj-dashboard-user-credentials" where user_id = $1`, [user.id]);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash)))
    throw new ValidationError("Current password is incorrect.", { currentPassword: "Current password is incorrect" });
  if (current === next) throw new ValidationError("Choose a password different from the current one.", { newPassword: "Must differ from the current password" });
  const hash = await hashPassword(next);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await sys(async (db) => {
    await db.query(`update "proj-dashboard-user-credentials" set password_hash = $2, must_change_password = false, password_changed_at = now() where user_id = $1`, [user.id, hash]);
    await db.query(`delete from "proj-dashboard-sessions" where user_id = $1 and token_hash <> $2`, [user.id, token ? sha256(token) : ""]);
    await db.query(
      `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, summary) values ($1,$2,'auth.password_change','user',$1,'Password changed')`,
      [user.id, user.fullName],
    );
  });
}
