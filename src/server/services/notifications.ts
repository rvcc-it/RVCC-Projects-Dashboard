import "server-only";
import { withUser } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { SessionUser } from "@/server/session-user";

export type NotificationItem = {
  id: string; type: string; title: string; body: string | null; link: string | null; isRead: boolean; createdAt: string;
};

const map = (x: Record<string, unknown>): NotificationItem => ({
  id: x.id as string, type: x.type as string, title: x.title as string, body: x.body as string | null, link: x.link as string | null,
  isRead: x.is_read as boolean, createdAt: x.created_at as string,
});

export async function getBell(user: SessionUser) {
  return withUser(user.id, async (db) => {
    const unread = (await db.query(`select count(*)::int as n from "proj-dashboard-notifications" where is_read = false`)).rows[0].n as number;
    const latest = (await db.query(`select * from "proj-dashboard-notifications" order by created_at desc limit 6`)).rows.map(map);
    return { unread, latest };
  });
}

export async function listNotifications(user: SessionUser, f: { unreadOnly?: boolean; type?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = f.pageSize ?? 15;
  const params: unknown[] = [];
  const w = ["true"];
  if (f.unreadOnly) w.push("is_read = false");
  if (f.type) {
    params.push(f.type + "%");
    w.push(`type like $${params.length}`);
  }
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select *, count(*) over()::int as total from "proj-dashboard-notifications" where ${w.join(" and ")} order by created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return { items: r.rows.map(map), total: (r.rows[0]?.total as number) ?? 0, page, pageSize };
  });
}

export async function markRead(user: SessionUser, id: string, read = true) {
  return withUser(user.id, async (db) => {
    const r = await db.query(`update "proj-dashboard-notifications" set is_read = $2, read_at = case when $2 then now() else null end where id = $1`, [id, read]);
    if (r.rowCount === 0) throw new NotFoundError();
  });
}
export async function markAllRead(user: SessionUser) {
  return withUser(user.id, async (db) => (await db.query(`update "proj-dashboard-notifications" set is_read = true, read_at = now() where is_read = false`)).rowCount);
}
export async function deleteNotification(user: SessionUser, id: string) {
  return withUser(user.id, async (db) => {
    const r = await db.query(`delete from "proj-dashboard-notifications" where id = $1`, [id]);
    if (r.rowCount === 0) throw new NotFoundError();
  });
}
export async function clearReadNotifications(user: SessionUser) {
  return withUser(user.id, async (db) => (await db.query(`delete from "proj-dashboard-notifications" where is_read = true`)).rowCount);
}
