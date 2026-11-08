import "server-only";
import type { Db } from "@/lib/db";
import type { SessionUser } from "@/server/session-user";

export type ActivityEvent = {
  action: string; // e.g. project.create, document.upload
  entityType: "project" | "document" | "user" | "role" | "category" | "member" | "setting" | "report" | "filter";
  entityId?: string | null;
  projectId?: string | null;
  documentId?: string | null;
  summary: string;
  previous?: unknown;
  next?: unknown;
};

/** Append-only audit trail entry. Must be called inside the same transaction as the change. */
export async function logActivity(db: Db, user: SessionUser, e: ActivityEvent) {
  await db.query(
    `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, project_id, document_id, summary, previous_value, new_value)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      user.id, user.fullName, e.action, e.entityType, e.entityId ?? null, e.projectId ?? null, e.documentId ?? null, e.summary,
      e.previous === undefined ? null : JSON.stringify(e.previous),
      e.next === undefined ? null : JSON.stringify(e.next),
    ],
  );
}

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  link?: string;
  projectId?: string | null;
  documentId?: string | null;
};

/** Notify users (the actor is never notified about their own action). */
export async function notifyUsers(db: Db, actor: SessionUser, userIds: string[], n: NotificationInput) {
  const targets = [...new Set(userIds)].filter((id) => id && id !== actor.id);
  if (!targets.length) return;
  await db.query(
    `insert into "proj-dashboard-notifications" (user_id, type, title, body, link, project_id, document_id, created_by)
     select u, $2, $3, $4, $5, $6, $7, $8 from unnest($1::uuid[]) as u`,
    [targets, n.type, n.title, n.body ?? null, n.link ?? null, n.projectId ?? null, n.documentId ?? null, actor.id],
  );
}

/** Members + manager of a project. */
export async function projectAudience(db: Db, projectId: string): Promise<string[]> {
  const r = await db.query<{ id: string }>(
    `select user_id as id from "proj-dashboard-project-members" where project_id = $1
     union select project_manager_id from "proj-dashboard-projects" where id = $1 and project_manager_id is not null`,
    [projectId],
  );
  return r.rows.map((x) => x.id);
}

/** Everyone who can see all projects (management + admins). */
export async function companyAudience(db: Db): Promise<string[]> {
  const r = await db.query<{ id: string }>(
    `select distinct ur.user_id as id
       from "proj-dashboard-user-roles" ur
       join "proj-dashboard-users" u on u.id = ur.user_id and u.is_active
       join "proj-dashboard-roles" r on r.id = ur.role_id
       left join "proj-dashboard-role-permissions" rp on rp.role_id = r.id
       left join "proj-dashboard-permissions" p on p.id = rp.permission_id
      where r.code = 'super_admin' or p.code = 'project.view_all'`,
  );
  return r.rows.map((x) => x.id);
}

export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const a = before[k], b = after[k];
    if (String(a ?? "") !== String(b ?? "")) {
      previous[k] = a ?? null;
      next[k] = b ?? null;
    }
  }
  return { previous, next, changed: Object.keys(next) };
}
