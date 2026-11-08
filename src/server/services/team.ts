import "server-only";
import { withUser } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { memberSchema } from "@/lib/validators";
import type { SessionUser } from "@/server/session-user";
import { logActivity, notifyUsers } from "@/server/activity";

export type TeamMember = {
  id: string; userId: string; fullName: string; email: string; department: string | null; jobTitle: string | null; systemRole: string | null;
  memberRole: string; canEdit: boolean; canUpload: boolean; canDeleteDocs: boolean; canManageTeam: boolean; isManager: boolean; isActive: boolean; createdAt: string;
};

function parse(raw: unknown) {
  const r = memberSchema.safeParse(raw);
  if (!r.success) {
    const fe: Record<string, string> = {};
    r.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    throw new ValidationError("Please correct the highlighted fields.", fe);
  }
  return r.data;
}

export async function listMembers(user: SessionUser, projectId: string): Promise<TeamMember[]> {
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select m.id, m.user_id, m.member_role, m.can_edit, m.can_upload, m.can_delete_docs, m.can_manage_team, m.created_at,
              u.full_name, u.email, u.department, u.job_title, u.is_active, p.project_manager_id,
              (select r.name from "proj-dashboard-user-roles" ur join "proj-dashboard-roles" r on r.id = ur.role_id where ur.user_id = u.id limit 1) as system_role
         from "proj-dashboard-project-members" m
         join "proj-dashboard-users" u on u.id = m.user_id
         join "proj-dashboard-projects" p on p.id = m.project_id
        where m.project_id = $1
        order by (m.user_id = p.project_manager_id) desc, u.full_name`,
      [projectId],
    );
    return r.rows.map((x) => ({
      id: x.id, userId: x.user_id, fullName: x.full_name, email: x.email, department: x.department, jobTitle: x.job_title, systemRole: x.system_role,
      memberRole: x.member_role, canEdit: x.can_edit, canUpload: x.can_upload, canDeleteDocs: x.can_delete_docs, canManageTeam: x.can_manage_team,
      isManager: x.user_id === x.project_manager_id, isActive: x.is_active, createdAt: x.created_at,
    }));
  });
}

export async function addMember(user: SessionUser, projectId: string, raw: unknown) {
  const i = parse(raw);
  return withUser(user.id, async (db) => {
    const p = (await db.query(`select code, name from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [projectId])).rows[0];
    if (!p) throw new NotFoundError();
    const target = (await db.query(`select full_name from "proj-dashboard-users" where id = $1 and is_active`, [i.userId])).rows[0];
    if (!target) throw new ValidationError("The selected user does not exist or is inactive.", { userId: "Select an active user" });
    const dup = await db.query(`select 1 from "proj-dashboard-project-members" where project_id = $1 and user_id = $2`, [projectId, i.userId]);
    if (dup.rowCount) throw new ConflictError("This user is already a member of the project.", { userId: "Already a member" });
    const r = await db.query(
      `insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_edit, can_upload, can_delete_docs, can_manage_team, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8) returning id`,
      [projectId, i.userId, i.memberRole, i.canEdit, i.canUpload, i.canDeleteDocs, i.canManageTeam, user.id],
    );
    await logActivity(db, user, {
      action: "member.add", entityType: "member", entityId: r.rows[0].id, projectId,
      summary: `Added ${target.full_name} to ${p.code}`, next: i,
    });
    await notifyUsers(db, user, [i.userId], {
      type: "project.assigned", title: "You were assigned to a project", body: `${p.code} – ${p.name}`, link: `/projects/${projectId}`, projectId,
    });
    return { id: r.rows[0].id as string };
  });
}

export async function updateMember(user: SessionUser, projectId: string, memberId: string, raw: unknown) {
  const i = parse(raw);
  return withUser(user.id, async (db) => {
    const cur = (await db.query(
      `select m.*, u.full_name, p.code, p.project_manager_id from "proj-dashboard-project-members" m join "proj-dashboard-users" u on u.id = m.user_id join "proj-dashboard-projects" p on p.id = m.project_id
        where m.id = $1 and m.project_id = $2`,
      [memberId, projectId],
    )).rows[0];
    if (!cur) throw new NotFoundError();
    const isPm = cur.user_id === cur.project_manager_id;
    if (isPm && (i.memberRole !== "manager" || !i.canEdit || !i.canManageTeam))
      throw new ConflictError("The project manager keeps the manager role with edit and team rights. Change the project manager on the project page instead.");
    if (!isPm && i.memberRole === "manager") throw new ConflictError("Only the assigned project manager can hold the manager role.");
    const u = await db.query(
      `update "proj-dashboard-project-members" set member_role = $3, can_edit = $4, can_upload = $5, can_delete_docs = $6, can_manage_team = $7, updated_by = $8
        where id = $1 and project_id = $2`,
      [memberId, projectId, i.memberRole, i.canEdit, i.canUpload, i.canDeleteDocs, i.canManageTeam, user.id],
    );
    if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to manage this project's team.");
    await logActivity(db, user, {
      action: "member.update", entityType: "member", entityId: memberId, projectId, summary: `Updated ${cur.full_name}'s access on ${cur.code}`,
      previous: { memberRole: cur.member_role, canEdit: cur.can_edit, canUpload: cur.can_upload, canDeleteDocs: cur.can_delete_docs, canManageTeam: cur.can_manage_team },
      next: { memberRole: i.memberRole, canEdit: i.canEdit, canUpload: i.canUpload, canDeleteDocs: i.canDeleteDocs, canManageTeam: i.canManageTeam },
    });
  });
}

export async function removeMember(user: SessionUser, projectId: string, memberId: string) {
  return withUser(user.id, async (db) => {
    const cur = (await db.query(
      `select m.user_id, u.full_name, p.code, p.project_manager_id from "proj-dashboard-project-members" m join "proj-dashboard-users" u on u.id = m.user_id join "proj-dashboard-projects" p on p.id = m.project_id
        where m.id = $1 and m.project_id = $2`,
      [memberId, projectId],
    )).rows[0];
    if (!cur) throw new NotFoundError();
    if (cur.user_id === cur.project_manager_id)
      throw new ConflictError("This user is the project manager. Assign a different project manager before removing them.");
    const d = await db.query(`delete from "proj-dashboard-project-members" where id = $1 and project_id = $2`, [memberId, projectId]);
    if (d.rowCount === 0) throw new ForbiddenError("You are not allowed to manage this project's team.");
    await logActivity(db, user, {
      action: "member.remove", entityType: "member", entityId: memberId, projectId, summary: `Removed ${cur.full_name} from ${cur.code}`,
    });
    await notifyUsers(db, user, [cur.user_id], {
      type: "project.unassigned", title: "You were removed from a project", body: cur.code, link: "/projects", projectId: null,
    });
  });
}

/** Projects a given user belongs to, limited to what the acting user may see. */
export async function listUserAssignments(user: SessionUser, userId: string) {
  return withUser(user.id, async (db) =>
    (await db.query(
      `select m.id, m.project_id, p.code, p.name, p.status, m.member_role, m.can_edit, m.can_upload, m.can_delete_docs, m.can_manage_team,
              (p.project_manager_id = m.user_id) as is_manager
         from "proj-dashboard-project-members" m join "proj-dashboard-projects" p on p.id = m.project_id
        where m.user_id = $1 and p.deleted_at is null order by p.code`,
      [userId],
    )).rows.map((x) => ({
      id: x.id as string, projectId: x.project_id as string, code: x.code as string, name: x.name as string, status: x.status as string,
      memberRole: x.member_role as string, canEdit: x.can_edit as boolean, canUpload: x.can_upload as boolean,
      canDeleteDocs: x.can_delete_docs as boolean, canManageTeam: x.can_manage_team as boolean, isManager: x.is_manager as boolean,
    })),
  );
}

/** Active users that can still be added to the project (for the "add member" picker). */
export async function listAssignableUsers(user: SessionUser, projectId: string) {
  return withUser(user.id, async (db) =>
    (await db.query(
      `select u.id, u.full_name, u.email, u.department from "proj-dashboard-users" u
        where u.is_active and not exists (select 1 from "proj-dashboard-project-members" m where m.project_id = $1 and m.user_id = u.id)
        order by u.full_name`,
      [projectId],
    )).rows.map((x) => ({ id: x.id as string, name: x.full_name as string, email: x.email as string, department: x.department as string | null })),
  );
}
