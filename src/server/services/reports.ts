import "server-only";
import { withUser } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";
import { buildProjectWhere, type ProjectFilters } from "@/lib/filters";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/constants";
import type { SessionUser } from "@/server/session-user";

export const REPORT_TYPES = [
  { key: "project_documents", label: "Project-wise document report", description: "Documents and revisions per project" },
  { key: "project_status", label: "Project status report", description: "Status, progress and key dates of every project" },
  { key: "by_manager", label: "Project manager-wise report", description: "Portfolio and workload per project manager" },
  { key: "by_location", label: "Location-wise project report", description: "Projects, progress and documents per location" },
  { key: "document_uploads", label: "Document upload report", description: "Every upload (incl. revisions) with uploader and size" },
  { key: "recent_activity", label: "Recent activity report", description: "Latest audit trail entries for the selected projects" },
] as const;
export type ReportType = (typeof REPORT_TYPES)[number]["key"];

export type ColType = "text" | "number" | "date" | "datetime" | "bytes" | "percent";
export type ReportColumn = { key: string; label: string; type: ColType };
export type ReportResult = {
  type: ReportType; title: string; columns: ReportColumn[]; rows: Record<string, string | number | null>[]; truncated: boolean; generatedAt: string;
};
export type ReportOptions = { from?: string; to?: string };

const LIMIT = 5000;
const FROM = `from "proj-dashboard-projects" p left join "proj-dashboard-users" pm on pm.id = p.project_manager_id`;
const dateOk = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export async function runReport(user: SessionUser, type: string, f: ProjectFilters, o: ReportOptions = {}): Promise<ReportResult> {
  if (!hasPerm(user, PERMS.reportView)) throw new ForbiddenError("You do not have access to reports.");
  const def = REPORT_TYPES.find((r) => r.key === type);
  if (!def) throw new ValidationError("Unknown report type.");
  const { where, params } = buildProjectWhere(f);
  const from = dateOk(o.from);
  const to = dateOk(o.to);

  return withUser(user.id, async (db) => {
    const done = (columns: ReportColumn[], rows: Record<string, string | number | null>[]): ReportResult => ({
      type: def.key, title: def.label, columns, rows: rows.slice(0, LIMIT), truncated: rows.length > LIMIT, generatedAt: new Date().toISOString(),
    });
    const lim = `limit ${LIMIT + 1}`;

    switch (def.key) {
      case "project_status": {
        const r = await db.query(
          `select p.code, p.name, p.client_name, p.location, p.category, pm.full_name as manager, p.status, p.progress, p.start_date,
                  p.expected_completion, p.actual_completion, p.updated_at ${FROM} where ${where} order by p.code ${lim}`, params);
        return done(
          [
            { key: "code", label: "Code", type: "text" }, { key: "name", label: "Project", type: "text" }, { key: "client", label: "Client", type: "text" },
            { key: "location", label: "Location", type: "text" }, { key: "category", label: "Category", type: "text" }, { key: "manager", label: "Project Manager", type: "text" },
            { key: "status", label: "Status", type: "text" }, { key: "progress", label: "Progress", type: "percent" }, { key: "start", label: "Start", type: "date" },
            { key: "expected", label: "Expected Completion", type: "date" }, { key: "actual", label: "Actual Completion", type: "date" }, { key: "updated", label: "Last Updated", type: "datetime" },
          ],
          r.rows.map((x) => ({
            code: x.code, name: x.name, client: x.client_name, location: x.location, category: x.category, manager: x.manager ?? "Unassigned",
            status: STATUS_LABEL[x.status as ProjectStatus] ?? x.status, progress: x.progress, start: x.start_date, expected: x.expected_completion, actual: x.actual_completion, updated: x.updated_at,
          })),
        );
      }
      case "project_documents": {
        const r = await db.query(
          `select p.code, p.name, p.status, pm.full_name as manager,
                  (select count(*)::int from "proj-dashboard-documents" d where d.project_id = p.id and d.deleted_at is null) as docs,
                  (select count(*)::int from "proj-dashboard-document-revisions" rv join "proj-dashboard-documents" d on d.id = rv.document_id where d.project_id = p.id and d.deleted_at is null) as revisions,
                  (select coalesce(sum(rv.file_size), 0)::bigint from "proj-dashboard-document-revisions" rv join "proj-dashboard-documents" d on d.id = rv.document_id where d.project_id = p.id and d.deleted_at is null) as bytes,
                  (select max(rv.created_at) from "proj-dashboard-document-revisions" rv join "proj-dashboard-documents" d on d.id = rv.document_id where d.project_id = p.id and d.deleted_at is null) as last_upload
             ${FROM} where ${where} order by docs desc, p.code ${lim}`, params);
        return done(
          [
            { key: "code", label: "Code", type: "text" }, { key: "name", label: "Project", type: "text" }, { key: "status", label: "Status", type: "text" },
            { key: "manager", label: "Project Manager", type: "text" }, { key: "docs", label: "Documents", type: "number" }, { key: "revisions", label: "Revisions", type: "number" },
            { key: "bytes", label: "Storage Used", type: "bytes" }, { key: "last", label: "Last Upload", type: "datetime" },
          ],
          r.rows.map((x) => ({ code: x.code, name: x.name, status: STATUS_LABEL[x.status as ProjectStatus] ?? x.status, manager: x.manager ?? "Unassigned", docs: x.docs, revisions: x.revisions, bytes: x.bytes, last: x.last_upload })),
        );
      }
      case "by_manager":
      case "by_location": {
        const key = def.key === "by_manager" ? "coalesce(pm.full_name, 'Unassigned')" : "p.location";
        const r = await db.query(
          `select ${key} as grp, count(*)::int as total,
                  count(*) filter (where p.status = 'active')::int as active, count(*) filter (where p.status = 'completed')::int as completed,
                  count(*) filter (where p.status = 'on_hold')::int as on_hold, count(*) filter (where p.status = 'planning')::int as planning,
                  round(avg(p.progress))::int as avg_progress
             ${FROM} where ${where} group by 1 order by 2 desc, 1 ${lim}`, params);
        const base = r.rows;
        const docs = await db.query(
          `select ${key} as grp, count(d.id)::int as docs ${FROM} left join "proj-dashboard-documents" d on d.project_id = p.id and d.deleted_at is null where ${where} group by 1`, params);
        const dm = new Map(docs.rows.map((x) => [x.grp as string, x.docs as number]));
        return done(
          [
            { key: "grp", label: def.key === "by_manager" ? "Project Manager" : "Location", type: "text" }, { key: "total", label: "Projects", type: "number" },
            { key: "planning", label: "Planning", type: "number" }, { key: "active", label: "Active", type: "number" }, { key: "on_hold", label: "On Hold", type: "number" },
            { key: "completed", label: "Completed", type: "number" }, { key: "avg", label: "Avg. Progress", type: "percent" }, { key: "docs", label: "Documents", type: "number" },
          ],
          base.map((x) => ({ grp: x.grp, total: x.total, planning: x.planning, active: x.active, on_hold: x.on_hold, completed: x.completed, avg: x.avg_progress, docs: dm.get(x.grp) ?? 0 })),
        );
      }
      case "document_uploads": {
        const ps = [...params];
        const extra: string[] = [];
        if (from) {
          ps.push(from);
          extra.push(`rv.created_at >= $${ps.length}::date`);
        }
        if (to) {
          ps.push(to);
          extra.push(`rv.created_at < ($${ps.length}::date + 1)`);
        }
        const r = await db.query(
          `select rv.created_at, d.title, p.code, p.name as project, c.name as category, rv.revision_label, rv.revision_no, up.full_name as uploader, rv.file_name, rv.file_size, (d.deleted_at is not null) as deleted
             from "proj-dashboard-document-revisions" rv join "proj-dashboard-documents" d on d.id = rv.document_id join "proj-dashboard-projects" p on p.id = d.project_id
             join "proj-dashboard-document-categories" c on c.id = d.category_id left join "proj-dashboard-users" up on up.id = rv.created_by left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
            where ${where} ${extra.length ? "and " + extra.join(" and ") : ""} order by rv.created_at desc ${lim}`, ps);
        return done(
          [
            { key: "at", label: "Uploaded", type: "datetime" }, { key: "title", label: "Document", type: "text" }, { key: "code", label: "Project Code", type: "text" },
            { key: "project", label: "Project", type: "text" }, { key: "category", label: "Category", type: "text" }, { key: "rev", label: "Revision", type: "text" },
            { key: "uploader", label: "Uploaded By", type: "text" }, { key: "file", label: "File", type: "text" }, { key: "size", label: "Size", type: "bytes" }, { key: "state", label: "State", type: "text" },
          ],
          r.rows.map((x) => ({ at: x.created_at, title: x.title, code: x.code, project: x.project, category: x.category, rev: `${x.revision_label} (#${x.revision_no})`, uploader: x.uploader ?? "—", file: x.file_name, size: x.file_size, state: x.deleted ? "In trash" : "Available" })),
        );
      }
      case "recent_activity": {
        const ps = [...params];
        const extra: string[] = [];
        if (from) {
          ps.push(from);
          extra.push(`a.created_at >= $${ps.length}::date`);
        }
        if (to) {
          ps.push(to);
          extra.push(`a.created_at < ($${ps.length}::date + 1)`);
        }
        const r = await db.query(
          `select a.created_at, a.user_name, a.action, p.code, a.summary from "proj-dashboard-logs" a join "proj-dashboard-projects" p on p.id = a.project_id left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
            where ${where} ${extra.length ? "and " + extra.join(" and ") : ""} order by a.created_at desc ${lim}`, ps);
        return done(
          [
            { key: "at", label: "When", type: "datetime" }, { key: "user", label: "User", type: "text" }, { key: "action", label: "Action", type: "text" },
            { key: "code", label: "Project", type: "text" }, { key: "summary", label: "Details", type: "text" },
          ],
          r.rows.map((x) => ({ at: x.created_at, user: x.user_name, action: x.action, code: x.code, summary: x.summary })),
        );
      }
    }
  });
}
