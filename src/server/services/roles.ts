import "server-only";
import { withUser } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";
import { roleSchema } from "@/lib/validators";
import { assertPerm, type SessionUser } from "@/server/session-user";
import { logActivity } from "@/server/activity";

export type PermissionDef = { id: string; code: string; name: string; description: string | null; group: string };
export type RoleWithPerms = {
  id: string; code: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissionCodes: string[];
};

export async function getRoleMatrix(user: SessionUser): Promise<{ roles: RoleWithPerms[]; permissions: PermissionDef[] }> {
  if (!hasPerm(user, PERMS.userView) && !hasPerm(user, PERMS.userManage) && !hasPerm(user, PERMS.roleManage)) throw new ForbiddenError();
  return withUser(user.id, async (db) => {
    const perms = (await db.query(`select * from "proj-dashboard-permissions" order by group_name, code`)).rows.map((p) => ({
      id: p.id, code: p.code, name: p.name, description: p.description, group: p.group_name,
    }));
    const roles = (await db.query(
      `select r.*, (select count(*)::int from "proj-dashboard-user-roles" ur where ur.role_id = r.id) as user_count,
              coalesce((select array_agg(p.code order by p.code) from "proj-dashboard-role-permissions" rp join "proj-dashboard-permissions" p on p.id = rp.permission_id where rp.role_id = r.id), '{}') as codes
         from "proj-dashboard-roles" r order by (r.code = 'super_admin') desc, r.is_system desc, r.created_at`,
    )).rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.is_system, userCount: r.user_count,
      permissionCodes: r.code === "super_admin" ? perms.map((p) => p.code) : (r.codes as string[]),
    }));
    return { roles, permissions: perms };
  });
}

export async function listRoles(user: SessionUser) {
  return withUser(user.id, async (db) =>
    (await db.query(`select id, code, name from "proj-dashboard-roles" order by is_system desc, created_at`)).rows.map((r) => ({ id: r.id as string, code: r.code as string, name: r.name as string })),
  );
}

export async function setRolePermissions(user: SessionUser, roleId: string, codes: string[]) {
  assertPerm(user, PERMS.roleManage);
  return withUser(user.id, async (db) => {
    const role = (await db.query(`select code, name from "proj-dashboard-roles" where id = $1`, [roleId])).rows[0];
    if (!role) throw new NotFoundError();
    if (role.code === "super_admin") throw new ConflictError("The Super Admin role always has every permission and cannot be edited.");
    const valid = (await db.query(`select id, code from "proj-dashboard-permissions" where code = any($1::text[])`, [codes])).rows;
    if (valid.length !== new Set(codes).size) throw new ValidationError("Unknown permission code supplied.");
    const before = (await db.query(`select p.code from "proj-dashboard-role-permissions" rp join "proj-dashboard-permissions" p on p.id = rp.permission_id where rp.role_id = $1 order by p.code`, [roleId])).rows.map((r) => r.code);
    await db.query(`delete from "proj-dashboard-role-permissions" where role_id = $1`, [roleId]);
    if (valid.length)
      await db.query(`insert into "proj-dashboard-role-permissions" (role_id, permission_id, created_by) select $1, unnest($2::uuid[]), $3`, [roleId, valid.map((v) => v.id), user.id]);
    const after = valid.map((v) => v.code as string).sort();
    const added = after.filter((c) => !before.includes(c));
    const removed = before.filter((c: string) => !after.includes(c));
    if (added.length || removed.length)
      await logActivity(db, user, {
        action: "role.permissions", entityType: "role", entityId: roleId, summary: `Changed permissions of role ${role.name}`, previous: { removed }, next: { added },
      });
    return { added, removed };
  });
}

export async function createRole(user: SessionUser, raw: unknown) {
  assertPerm(user, PERMS.roleManage);
  const r = roleSchema.safeParse(raw);
  if (!r.success) {
    const fe: Record<string, string> = {};
    r.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    throw new ValidationError("Please correct the highlighted fields.", fe);
  }
  return withUser(user.id, async (db) => {
    const dup = await db.query(`select 1 from "proj-dashboard-roles" where code = $1`, [r.data.code]);
    if (dup.rowCount) throw new ConflictError("A role with this code already exists.", { code: "Already exists" });
    const ins = await db.query(`insert into "proj-dashboard-roles" (code, name, description, created_by, updated_by) values ($1,$2,$3,$4,$4) returning id`, [r.data.code, r.data.name, r.data.description || null, user.id]);
    await logActivity(db, user, { action: "role.create", entityType: "role", entityId: ins.rows[0].id, summary: `Created role ${r.data.name}`, next: r.data });
    return { id: ins.rows[0].id as string };
  });
}

export async function deleteRole(user: SessionUser, id: string) {
  assertPerm(user, PERMS.roleManage);
  return withUser(user.id, async (db) => {
    const role = (await db.query(`select name, is_system from "proj-dashboard-roles" where id = $1`, [id])).rows[0];
    if (!role) throw new NotFoundError();
    if (role.is_system) throw new ConflictError("Built-in roles cannot be deleted.");
    const users = (await db.query(`select count(*)::int as n from "proj-dashboard-user-roles" where role_id = $1`, [id])).rows[0].n;
    if (users) throw new ConflictError(`${users} user(s) hold this role. Reassign them first.`);
    const d = await db.query(`delete from "proj-dashboard-roles" where id = $1`, [id]);
    if (d.rowCount === 0) throw new ForbiddenError();
    await logActivity(db, user, { action: "role.delete", entityType: "role", entityId: null, summary: `Deleted role ${role.name}` });
  });
}
