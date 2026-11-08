import "server-only";
import { withUser } from "@/lib/db";
import { buildProjectWhere, type ProjectFilters } from "@/lib/filters";
import { STATUS_LABEL, type ProjectStatus } from "@/lib/constants";
import type { SessionUser } from "@/server/session-user";

/** A project "requires attention" when it is on hold, overdue, or clearly behind schedule. */
export const ATTENTION_SQL = `(
  p.status = 'on_hold'
  or (p.status in ('planning','active') and p.expected_completion < current_date)
  or (p.status = 'active' and p.start_date is not null and p.expected_completion is not null and p.expected_completion > p.start_date
      and p.progress < 100 * least(1, (current_date - p.start_date)::numeric / nullif(p.expected_completion - p.start_date, 0)) - 25)
)`;

export type Slice = { key: string; label: string; value: number };
export type MonthPoint = { month: string; label: string; a: number; b: number };

export type DashboardData = {
  kpis: {
    total: number; active: number; completed: number; onHold: number; planning: number; cancelled: number; attention: number;
    documents: number; newProjectsThisMonth: number; docsThisMonth: number; docsLastMonth: number;
  };
  byStatus: Slice[]; byLocation: Slice[]; byManager: Slice[]; byCategory: Slice[];
  timeline: { id: string; code: string; name: string; start: string; expected: string; actual: string | null; status: string; progress: number }[];
  monthly: MonthPoint[]; // a = projects started, b = activity events
  docsOverTime: MonthPoint[]; // a = uploads
  attention: { id: string; code: string; name: string; status: string; progress: number; reason: string; managerName: string | null }[];
};

const FROM = `from "proj-dashboard-projects" p left join "proj-dashboard-users" pm on pm.id = p.project_manager_id`;

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export async function getDashboard(user: SessionUser, f: ProjectFilters): Promise<DashboardData> {
  const { where, params } = buildProjectWhere({ ...f, archived: "exclude" });
  return withUser(user.id, async (db) => {
    const k = (await db.query(
      `select count(*)::int as total,
              count(*) filter (where p.status = 'active')::int as active,
              count(*) filter (where p.status = 'completed')::int as completed,
              count(*) filter (where p.status = 'on_hold')::int as on_hold,
              count(*) filter (where p.status = 'planning')::int as planning,
              count(*) filter (where p.status = 'cancelled')::int as cancelled,
              count(*) filter (where ${ATTENTION_SQL})::int as attention,
              count(*) filter (where p.created_at >= date_trunc('month', now()))::int as new_month
         ${FROM} where ${where}`,
      params,
    )).rows[0];
    const d = (await db.query(
      `select count(*)::int as total,
              count(*) filter (where d.created_at >= date_trunc('month', now()))::int as this_month,
              count(*) filter (where d.created_at >= date_trunc('month', now()) - interval '1 month' and d.created_at < date_trunc('month', now()))::int as last_month
         from "proj-dashboard-documents" d join "proj-dashboard-projects" p on p.id = d.project_id left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
        where d.deleted_at is null and ${where}`,
      params,
    )).rows[0];

    const group = async (expr: string, limit = 10): Promise<Slice[]> =>
      (await db.query(
        `select ${expr} as label, count(*)::int as value ${FROM} where ${where} group by 1 order by 2 desc, 1 limit ${limit}`,
        params,
      )).rows.map((r) => ({ key: r.label, label: r.label, value: r.value }));

    const byStatus = (await db.query(`select p.status as key, count(*)::int as value ${FROM} where ${where} group by 1`, params)).rows
      .map((r) => ({ key: r.key as string, label: STATUS_LABEL[r.key as ProjectStatus] ?? r.key, value: r.value as number }))
      .sort((a, b) => b.value - a.value);

    const byManagerRows = (await db.query(
      `select pm.id as key, coalesce(pm.full_name, 'Unassigned') as label, count(*)::int as value ${FROM} where ${where} group by 1,2 order by 3 desc, 2 limit 10`,
      params,
    )).rows.map((r) => ({ key: (r.key as string) ?? "", label: r.label as string, value: r.value as number }));

    const timeline = (await db.query(
      `select p.id, p.code, p.name, p.start_date, p.expected_completion, p.actual_completion, p.status, p.progress ${FROM}
        where ${where} and p.start_date is not null and p.expected_completion is not null order by p.start_date, p.code limit 14`,
      params,
    )).rows.map((r) => ({ id: r.id, code: r.code, name: r.name, start: r.start_date, expected: r.expected_completion, actual: r.actual_completion, status: r.status, progress: r.progress }));

    const months = `with months as (select generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as m)`;
    const monthly = (await db.query(
      `${months}
       select to_char(m, 'YYYY-MM') as month,
         (select count(*)::int ${FROM} where ${where} and p.start_date >= m and p.start_date < m + interval '1 month') as a,
         (select count(*)::int from "proj-dashboard-logs" al join "proj-dashboard-projects" p on p.id = al.project_id left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
           where ${where} and al.created_at >= m and al.created_at < m + interval '1 month') as b
       from months order by m`,
      params,
    )).rows.map((r) => ({ month: r.month, label: monthLabel(r.month), a: r.a, b: r.b }));

    const docsOverTime = (await db.query(
      `${months}
       select to_char(m, 'YYYY-MM') as month,
         (select count(*)::int from "proj-dashboard-document-revisions" r join "proj-dashboard-documents" d on d.id = r.document_id and d.deleted_at is null
            join "proj-dashboard-projects" p on p.id = d.project_id left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
           where ${where} and r.created_at >= m and r.created_at < m + interval '1 month') as a
       from months order by m`,
      params,
    )).rows.map((r) => ({ month: r.month, label: monthLabel(r.month), a: r.a, b: 0 }));

    const attention = (await db.query(
      `select p.id, p.code, p.name, p.status, p.progress, pm.full_name as manager_name,
              case when p.status = 'on_hold' then 'On hold'
                   when p.expected_completion < current_date then 'Overdue since ' || to_char(p.expected_completion, 'DD Mon YYYY')
                   else 'Behind schedule' end as reason
         ${FROM} where ${where} and ${ATTENTION_SQL} order by p.expected_completion nulls last limit 6`,
      params,
    )).rows.map((r) => ({ id: r.id, code: r.code, name: r.name, status: r.status, progress: r.progress, reason: r.reason, managerName: r.manager_name }));

    return {
      kpis: {
        total: k.total, active: k.active, completed: k.completed, onHold: k.on_hold, planning: k.planning, cancelled: k.cancelled, attention: k.attention,
        documents: d.total, newProjectsThisMonth: k.new_month, docsThisMonth: d.this_month, docsLastMonth: d.last_month,
      },
      byStatus,
      byLocation: await group("p.location"),
      byManager: byManagerRows,
      byCategory: await group("p.category"),
      timeline, monthly, docsOverTime, attention,
    };
  });
}
