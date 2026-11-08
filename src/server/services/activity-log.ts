import "server-only";
import { withUser } from "@/lib/db";
import type { SessionUser } from "@/server/session-user";

export type ActivityItem = {
  id: string; userName: string; action: string; entityType: string; summary: string; projectId: string | null; projectCode: string | null;
  documentId: string | null; previous: Record<string, unknown> | null; next: Record<string, unknown> | null; createdAt: string;
};

/** Audit trail. RLS limits rows to the user's own actions, projects they can see, or everything with audit.view. */
export async function listActivity(
  user: SessionUser,
  f: { projectId?: string; documentId?: string; userId?: string; action?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = f.pageSize ?? 15;
  const params: unknown[] = [];
  const w = ["true"];
  if (f.projectId && /^[0-9a-f-]{36}$/i.test(f.projectId)) {
    params.push(f.projectId);
    w.push(`a.project_id = $${params.length}`);
  }
  if (f.documentId && /^[0-9a-f-]{36}$/i.test(f.documentId)) {
    params.push(f.documentId);
    w.push(`a.document_id = $${params.length}`);
  }
  if (f.userId && /^[0-9a-f-]{36}$/i.test(f.userId)) {
    params.push(f.userId);
    w.push(`a.user_id = $${params.length}`);
  }
  if (f.action) {
    params.push(f.action.replace(/[\\%_]/g, (m) => "\\" + m) + "%");
    w.push(`a.action like $${params.length}`);
  }
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select a.*, p.code as project_code, count(*) over()::int as total
         from "proj-dashboard-logs" a left join "proj-dashboard-projects" p on p.id = a.project_id
        where ${w.join(" and ")} order by a.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    const items: ActivityItem[] = r.rows.map((x) => ({
      id: x.id, userName: x.user_name, action: x.action, entityType: x.entity_type, summary: x.summary, projectId: x.project_id, projectCode: x.project_code,
      documentId: x.document_id, previous: x.previous_value, next: x.new_value, createdAt: x.created_at,
    }));
    return { items, total: r.rows[0]?.total ?? 0, page, pageSize };
  });
}
