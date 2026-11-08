import "server-only";
import { withUser } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { PERMS } from "@/lib/permissions";
import { parseFilters, filtersToParams, type ProjectFilters } from "@/lib/filters";
import { assertPerm, type SessionUser } from "@/server/session-user";

export type SavedFilter = { id: string; name: string; scope: string; query: string; createdAt: string };

export async function listSavedFilters(user: SessionUser, scope = "dashboard"): Promise<SavedFilter[]> {
  return withUser(user.id, async (db) =>
    (await db.query(`select * from "proj-dashboard-saved-filters" where scope = $1 order by name`, [scope])).rows.map((x) => ({
      id: x.id, name: x.name, scope: x.scope, query: filtersToParams(parseFilters(new URLSearchParams(x.filters.query ?? ""))).toString(), createdAt: x.created_at,
    })),
  );
}

export async function saveFilter(user: SessionUser, name: string, filters: ProjectFilters, scope = "dashboard") {
  assertPerm(user, PERMS.filterSave);
  const n = name.trim();
  if (n.length < 2 || n.length > 60) throw new ValidationError("Name must be 2–60 characters.", { name: "2–60 characters" });
  const query = filtersToParams(filters).toString();
  if (!query) throw new ValidationError("Apply at least one filter before saving.");
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `insert into "proj-dashboard-saved-filters" (user_id, name, scope, filters, created_by, updated_by) values ($1,$2,$3,$4,$1,$1) returning id`,
      [user.id, n, scope, JSON.stringify({ query })],
    );
    return { id: r.rows[0].id as string };
  });
}

export async function deleteSavedFilter(user: SessionUser, id: string) {
  return withUser(user.id, async (db) => {
    const r = await db.query(`delete from "proj-dashboard-saved-filters" where id = $1`, [id]);
    if (r.rowCount === 0) throw new NotFoundError();
  });
}
