import "server-only";
import { withUser } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMS } from "@/lib/permissions";
import { categorySchema } from "@/lib/validators";
import { assertPerm, type SessionUser } from "@/server/session-user";
import { logActivity } from "@/server/activity";

export type Category = { id: string; name: string; description: string | null; sortOrder: number; isActive: boolean; docCount: number };

function parse(raw: unknown) {
  const r = categorySchema.safeParse(raw);
  if (!r.success) {
    const fe: Record<string, string> = {};
    r.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    throw new ValidationError("Please correct the highlighted fields.", fe);
  }
  return r.data;
}

export async function listCategories(user: SessionUser, opts: { activeOnly?: boolean } = {}): Promise<Category[]> {
  return withUser(user.id, async (db) =>
    (await db.query(
      `select c.*, (select count(*)::int from "proj-dashboard-documents" d where d.category_id = c.id) as doc_count
         from "proj-dashboard-document-categories" c ${opts.activeOnly ? "where c.is_active" : ""} order by c.sort_order, c.name`,
    )).rows.map((x) => ({ id: x.id, name: x.name, description: x.description, sortOrder: x.sort_order, isActive: x.is_active, docCount: x.doc_count })),
  );
}

export async function createCategory(user: SessionUser, raw: unknown) {
  assertPerm(user, PERMS.categoryManage);
  const i = parse(raw);
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `insert into "proj-dashboard-document-categories" (name, description, sort_order, is_active, created_by, updated_by) values ($1,$2,$3,$4,$5,$5) returning id`,
      [i.name, i.description || null, i.sortOrder, i.isActive, user.id],
    );
    await logActivity(db, user, { action: "category.create", entityType: "category", entityId: r.rows[0].id, summary: `Created document category "${i.name}"`, next: i });
    return { id: r.rows[0].id as string };
  });
}

export async function updateCategory(user: SessionUser, id: string, raw: unknown) {
  assertPerm(user, PERMS.categoryManage);
  const i = parse(raw);
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select * from "proj-dashboard-document-categories" where id = $1`, [id])).rows[0];
    if (!cur) throw new NotFoundError();
    const u = await db.query(
      `update "proj-dashboard-document-categories" set name = $2, description = $3, sort_order = $4, is_active = $5, updated_by = $6 where id = $1`,
      [id, i.name, i.description || null, i.sortOrder, i.isActive, user.id],
    );
    if (u.rowCount === 0) throw new ForbiddenError();
    await logActivity(db, user, {
      action: "category.update", entityType: "category", entityId: id, summary: `Updated document category "${i.name}"`,
      previous: { name: cur.name, description: cur.description, sortOrder: cur.sort_order, isActive: cur.is_active }, next: i,
    });
  });
}

/** Delete a category. When documents still use it, `reassignToId` is required and those documents are moved first. */
export async function deleteCategory(user: SessionUser, id: string, reassignToId?: string) {
  assertPerm(user, PERMS.categoryManage);
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select name from "proj-dashboard-document-categories" where id = $1`, [id])).rows[0];
    if (!cur) throw new NotFoundError();
    const used = (await db.query(`select count(*)::int as n from "proj-dashboard-documents" where category_id = $1`, [id])).rows[0].n;
    if (used > 0) {
      if (!reassignToId) throw new ConflictError(`${used} document(s) use this category. Choose a category to move them to, or deactivate it instead.`);
      if (reassignToId === id) throw new ValidationError("Choose a different category to reassign to.");
      const target = (await db.query(`select name, is_active from "proj-dashboard-document-categories" where id = $1`, [reassignToId])).rows[0];
      if (!target?.is_active) throw new ValidationError("The target category must exist and be active.");
      await db.query(`update "proj-dashboard-documents" set category_id = $2, updated_by = $3 where category_id = $1`, [id, reassignToId, user.id]);
    }
    const d = await db.query(`delete from "proj-dashboard-document-categories" where id = $1`, [id]);
    if (d.rowCount === 0) throw new ForbiddenError();
    await logActivity(db, user, {
      action: "category.delete", entityType: "category", entityId: id,
      summary: `Deleted document category "${cur.name}"${used ? ` (${used} documents reassigned)` : ""}`,
    });
  });
}
