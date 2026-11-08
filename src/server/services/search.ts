import "server-only";
import { withUser } from "@/lib/db";
import type { SessionUser } from "@/server/session-user";

export type SearchResults = {
  projects: { id: string; code: string; name: string; location: string; managerName: string | null; status: string }[];
  documents: { id: string; title: string; projectCode: string; category: string }[];
  categories: { id: string; name: string; count: number }[];
  locations: { name: string; count: number }[];
};

const esc = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

/** Global search. Runs under RLS, so only records the user may access are ever returned. */
export async function globalSearch(user: SessionUser, q: string): Promise<SearchResults> {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return { projects: [], documents: [], categories: [], locations: [] };
  const like = "%" + esc(term) + "%";
  return withUser(user.id, async (db) => {
    const projects = (await db.query(
      `select p.id, p.code, p.name, p.location, p.status, pm.full_name as manager_name
         from "proj-dashboard-projects" p left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
        where p.deleted_at is null and (p.name ilike $1 or p.code ilike $1 or p.location ilike $1 or p.client_name ilike $1 or pm.full_name ilike $1)
        order by p.updated_at desc limit 6`,
      [like],
    )).rows.map((x) => ({ id: x.id, code: x.code, name: x.name, location: x.location, managerName: x.manager_name, status: x.status }));
    const documents = (await db.query(
      `select d.id, d.title, p.code as project_code, c.name as category
         from "proj-dashboard-documents" d join "proj-dashboard-projects" p on p.id = d.project_id join "proj-dashboard-document-categories" c on c.id = d.category_id
        where d.deleted_at is null and p.deleted_at is null and (d.title ilike $1 or c.name ilike $1)
        order by d.updated_at desc limit 6`,
      [like],
    )).rows.map((x) => ({ id: x.id, title: x.title, projectCode: x.project_code, category: x.category }));
    const categories = (await db.query(
      `select c.id, c.name, count(d.id)::int as n from "proj-dashboard-document-categories" c
         join "proj-dashboard-documents" d on d.category_id = c.id and d.deleted_at is null
        where c.name ilike $1 group by c.id, c.name order by n desc limit 4`,
      [like],
    )).rows.map((x) => ({ id: x.id, name: x.name, count: x.n }));
    const locations = (await db.query(
      `select p.location as name, count(*)::int as n from "proj-dashboard-projects" p where p.deleted_at is null and p.location ilike $1 group by 1 order by n desc limit 4`,
      [like],
    )).rows.map((x) => ({ name: x.name, count: x.n }));
    return { projects, documents, categories, locations };
  });
}
