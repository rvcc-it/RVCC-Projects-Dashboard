import "server-only";
import { withUser } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { PERMS } from "@/lib/permissions";
import { assertPerm, type SessionUser } from "@/server/session-user";
import { logActivity } from "@/server/activity";

export type AppSettings = { retentionDays: number; maxUploadMb: number };

export async function getSettings(user: SessionUser): Promise<AppSettings> {
  return withUser(user.id, async (db) => {
    const r = await db.query(`select key, value from "proj-dashboard-settings"`);
    const m = new Map(r.rows.map((x) => [x.key as string, Number(x.value)]));
    return { retentionDays: m.get("retention_days") ?? 30, maxUploadMb: m.get("max_upload_mb") ?? 50 };
  });
}

export async function updateSettings(user: SessionUser, input: AppSettings) {
  assertPerm(user, PERMS.settingsManage);
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3650)
    throw new ValidationError("Retention must be 1–3650 days.", { retentionDays: "1–3650 days" });
  if (!Number.isInteger(input.maxUploadMb) || input.maxUploadMb < 1 || input.maxUploadMb > 200)
    throw new ValidationError("Maximum upload size must be 1–200 MB.", { maxUploadMb: "1–200 MB" });
  return withUser(user.id, async (db) => {
    const before = await getSettingsTx(db);
    for (const [k, v] of [["retention_days", input.retentionDays], ["max_upload_mb", input.maxUploadMb]] as const)
      await db.query(
        `insert into "proj-dashboard-settings" (key, value, updated_by) values ($1, $2::jsonb, $3)
         on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
        [k, JSON.stringify(v), user.id],
      );
    await logActivity(db, user, { action: "setting.update", entityType: "setting", summary: "Updated system settings", previous: before, next: input });
  });
}

async function getSettingsTx(db: { query: (q: string) => Promise<{ rows: Record<string, unknown>[] }> }): Promise<AppSettings> {
  const r = await db.query(`select key, value from "proj-dashboard-settings"`);
  const m = new Map(r.rows.map((x) => [x.key as string, Number(x.value)]));
  return { retentionDays: m.get("retention_days") ?? 30, maxUploadMb: m.get("max_upload_mb") ?? 50 };
}
