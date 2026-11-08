import "server-only";
import { sysQuery } from "@/lib/db";
import { sys } from "@/lib/db";
import { AppError, ValidationError } from "@/lib/errors";
import { passwordSchema } from "@/lib/validators";
import { hashPassword, randomToken, sha256 } from "@/server/password";
import { sendMail } from "@/server/mail";

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Creates a single-use, 1-hour reset token (only the SHA-256 hash is stored). */
export async function createResetToken(userId: string) {
  const token = randomToken();
  await sysQuery(`update "proj-dashboard-password-reset-tokens" set used_at = now() where user_id = $1 and used_at is null`, [userId]);
  await sysQuery(
    `insert into "proj-dashboard-password-reset-tokens" (user_id, token_hash, expires_at) values ($1,$2, now() + interval '1 hour')`,
    [userId, sha256(token)],
  );
  return { token, url: `${appUrl()}/reset-password?token=${token}` };
}

/** Always resolves silently so account existence is never leaked. */
export async function requestPasswordReset(email: string) {
  const { rows } = await sysQuery(`select id, full_name from "proj-dashboard-users" where email = $1 and is_active`, [email.trim().toLowerCase()]);
  if (!rows[0]) return;
  const { url } = await createResetToken(rows[0].id);
  await sendMail(
    email,
    "Reset your RVCC Portal password",
    `Hello ${rows[0].full_name},\n\nUse the link below to choose a new password. It is valid for 1 hour and can be used once.\n\n${url}\n\nIf you did not request this, you can ignore this e-mail.`,
  );
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message, { newPassword: parsed.error.issues[0].message });
  const hash = await hashPassword(newPassword);
  await sys(async (db) => {
    const { rows } = await db.query(
      `update "proj-dashboard-password-reset-tokens" set used_at = now()
        where token_hash = $1 and used_at is null and expires_at > now() returning user_id`,
      [sha256(token)],
    );
    if (!rows[0]) throw new AppError("This reset link is invalid or has expired.", 400, "invalid_token");
    const uid = rows[0].user_id;
    await db.query(
      `insert into "proj-dashboard-user-credentials" (user_id, password_hash, must_change_password) values ($1,$2,false)
       on conflict (user_id) do update set password_hash = excluded.password_hash, must_change_password = false, password_changed_at = now()`,
      [uid, hash],
    );
    await db.query(`delete from "proj-dashboard-sessions" where user_id = $1`, [uid]);
    const u = await db.query(`select full_name from "proj-dashboard-users" where id = $1`, [uid]);
    await db.query(
      `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, summary) values ($1,$2,'auth.password_reset','user',$1,$3)`,
      [uid, u.rows[0]?.full_name ?? "User", "Password reset via e-mail link"],
    );
  });
}

