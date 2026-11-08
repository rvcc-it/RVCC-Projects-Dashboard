import "server-only";
import crypto from "node:crypto";
import { withUser, sysQuery, type Db, type Row } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";
import { projectSchema, type ProjectInput } from "@/lib/validators";
import { buildProjectWhere, type ProjectFilters } from "@/lib/filters";
import { assertPerm, type SessionUser } from "@/server/session-user";
import { companyAudience, diff, logActivity, notifyUsers, projectAudience } from "@/server/activity";
import { getStorage } from "@/server/storage";
import { deleteStoredFiles } from "@/server/cleanup";
import { MAX_COVER_BYTES } from "@/lib/constants";

export type ProjectListItem = {
  id: string; code: string; name: string; clientName: string; location: string; category: string;
  status: string; progress: number; startDate: string | null; expectedCompletion: string | null; actualCompletion: string | null;
  updatedAt: string; isArchived: boolean; managerId: string | null; managerName: string | null; docCount: number; canEdit: boolean;
};

const SORTS: Record<string, string> = {
  code: "p.code", name: "p.name", client: "p.client_name", location: "p.location", manager: "pm.full_name", status: "p.status",
  start: "p.start_date", expected: "p.expected_completion", progress: "p.progress", docs: "doc_count", updated: "p.updated_at",
};

export type ListOptions = { sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number };

export async function listProjects(user: SessionUser, f: ProjectFilters, o: ListOptions = {}) {
  const page = Math.max(1, o.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, o.pageSize ?? 10));
  const sort = SORTS[o.sort ?? "updated"] ?? SORTS.updated;
  const dir = o.dir === "asc" ? "asc" : "desc";
  const { where, params } = buildProjectWhere(f);
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select p.id, p.code, p.name, p.client_name, p.location, p.category, p.status, p.progress, p.start_date, p.expected_completion,
              p.actual_completion, p.updated_at, p.is_archived, pm.id as manager_id, pm.full_name as manager_name,
              (select count(*)::int from "proj-dashboard-documents" d where d.project_id = p.id and d.deleted_at is null) as doc_count,
              app_can_edit_project(p.id) as can_edit,
              count(*) over()::int as total
         from "proj-dashboard-projects" p left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
        where ${where}
        order by ${sort} ${dir} nulls last, p.created_at desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    const items: ProjectListItem[] = r.rows.map((x) => ({
      id: x.id, code: x.code, name: x.name, clientName: x.client_name, location: x.location, category: x.category, status: x.status,
      progress: x.progress, startDate: x.start_date, expectedCompletion: x.expected_completion, actualCompletion: x.actual_completion,
      updatedAt: x.updated_at, isArchived: x.is_archived, managerId: x.manager_id, managerName: x.manager_name, docCount: x.doc_count, canEdit: x.can_edit,
    }));
    return { items, total: r.rows[0]?.total ?? 0, page, pageSize };
  });
}

export type FilterOptions = {
  names: string[]; codes: string[]; locations: string[]; clients: string[]; categories: string[];
  managers: { id: string; name: string }[];
};

/** Slicer values: only values from "proj-dashboard-projects" the user is allowed to see. */
export async function getFilterOptions(user: SessionUser): Promise<FilterOptions> {
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select p.name, p.code, p.location, p.client_name, p.category, pm.id as mid, pm.full_name as mname
         from "proj-dashboard-projects" p left join "proj-dashboard-users" pm on pm.id = p.project_manager_id where p.deleted_at is null`,
    );
    const uniq = (k: string) => [...new Set(r.rows.map((x) => x[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    const managers = new Map<string, string>();
    r.rows.forEach((x) => x.mid && managers.set(x.mid, x.mname));
    return {
      names: uniq("name"), codes: uniq("code"), locations: uniq("location"), clients: uniq("client_name"), categories: uniq("category"),
      managers: [...managers].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

export type ProjectDetail = {
  id: string; code: string; name: string; clientName: string; mainContractor: string | null; consultant: string | null; location: string;
  description: string | null; category: string; managerId: string | null; managerName: string | null; status: string; progress: number;
  startDate: string | null; expectedCompletion: string | null; actualCompletion: string | null; remarks: string | null;
  hasCover: boolean; isArchived: boolean; archivedAt: string | null; createdAt: string; updatedAt: string; createdByName: string | null; updatedByName: string | null;
  contractValue: string | null; currency: string; contractValueVisible: boolean;
  caps: { edit: boolean; upload: boolean; deleteDocs: boolean; manageTeam: boolean };
  docCount: number; memberCount: number;
};

export async function getProject(user: SessionUser, id: string): Promise<ProjectDetail> {
  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select p.*, pm.full_name as manager_name, cu.full_name as created_by_name, uu.full_name as updated_by_name,
              (select count(*)::int from "proj-dashboard-documents" d where d.project_id = p.id and d.deleted_at is null) as doc_count,
              (select count(*)::int from "proj-dashboard-project-members" m where m.project_id = p.id) as member_count,
              app_can_edit_project(p.id) as c_edit, app_can_upload(p.id) as c_upload, app_can_delete_doc(p.id) as c_del, app_can_manage_team(p.id) as c_team
         from "proj-dashboard-projects" p
         left join "proj-dashboard-users" pm on pm.id = p.project_manager_id
         left join "proj-dashboard-users" cu on cu.id = p.created_by
         left join "proj-dashboard-users" uu on uu.id = p.updated_by
        where p.id = $1 and p.deleted_at is null`,
      [id],
    );
    const p = r.rows[0];
    if (!p) throw new NotFoundError();
    const fin = await db.query(`select contract_value, currency from "proj-dashboard-project-financials" where project_id = $1`, [id]);
    return {
      id: p.id, code: p.code, name: p.name, clientName: p.client_name, mainContractor: p.main_contractor, consultant: p.consultant,
      location: p.location, description: p.description, category: p.category, managerId: p.project_manager_id, managerName: p.manager_name,
      status: p.status, progress: p.progress, startDate: p.start_date, expectedCompletion: p.expected_completion,
      actualCompletion: p.actual_completion, remarks: p.remarks, hasCover: !!p.cover_key, isArchived: p.is_archived, archivedAt: p.archived_at,
      createdAt: p.created_at, updatedAt: p.updated_at, createdByName: p.created_by_name, updatedByName: p.updated_by_name,
      contractValue: fin.rows[0]?.contract_value ?? null, currency: fin.rows[0]?.currency ?? "SAR",
      contractValueVisible: hasPerm(user, PERMS.projectViewContractValue),
      caps: { edit: p.c_edit, upload: p.c_upload, deleteDocs: p.c_del, manageTeam: p.c_team },
      docCount: p.doc_count, memberCount: p.member_count,
    };
  });
}

// ---------------------------------------------------------------- write helpers
const nul = (s: string) => (s === "" ? null : s);

async function nextProjectCode(db: Db) {
  const r = await db.query<{ n: number }>(`select nextval('project_code_seq') as n`);
  return `PRJ-${new Date().getFullYear()}-${String(r.rows[0].n).padStart(4, "0")}`;
}

async function assertActiveUsers(db: Db, ids: string[]) {
  if (!ids.length) return;
  const r = await db.query(`select id from "proj-dashboard-users" where id = any($1::uuid[]) and is_active`, [ids]);
  if (r.rowCount !== new Set(ids).size) throw new ValidationError("One or more selected users do not exist or are inactive.");
}

/** Make `userId` the project's manager member (full project rights) */
async function upsertManagerMember(db: Db, actor: SessionUser, projectId: string, userId: string) {
  await db.query(
    `insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_edit, can_upload, can_delete_docs, can_manage_team, created_by, updated_by)
     values ($1,$2,'manager',true,true,true,true,$3,$3)
     on conflict (project_id, user_id) do update
       set member_role = 'manager', can_edit = true, can_upload = true, can_delete_docs = true, can_manage_team = true, updated_by = excluded.updated_by`,
    [projectId, userId, actor.id],
  );
}

function normalise(i: ProjectInput) {
  const status = i.status;
  let progress = i.progress;
  let actual = nul(i.actualCompletion);
  if (status === "completed") {
    progress = 100;
    actual = actual ?? new Date().toISOString().slice(0, 10);
  } else if (status !== "cancelled") {
    actual = null;
  }
  return {
    name: i.name, client_name: i.clientName, main_contractor: nul(i.mainContractor), consultant: nul(i.consultant), location: i.location,
    description: nul(i.description), category: i.category, status, progress, start_date: nul(i.startDate),
    expected_completion: nul(i.expectedCompletion), actual_completion: actual, remarks: nul(i.remarks),
  };
}

function parseInput(input: unknown): ProjectInput {
  const r = projectSchema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    r.error.issues.forEach((x) => (fieldErrors[String(x.path[0])] ??= x.message));
    throw new ValidationError("Please correct the highlighted fields.", fieldErrors);
  }
  return r.data;
}

export async function createProject(user: SessionUser, raw: unknown) {
  assertPerm(user, PERMS.projectCreate);
  const input = parseInput(raw);
  if (input.projectManagerId) assertPerm(user, PERMS.projectAssignManager, "You are not allowed to assign a project manager.");
  if (input.contractValue) assertPerm(user, PERMS.projectEditContractValue, "You are not allowed to set the contract value.");
  const n = normalise(input);

  return withUser(user.id, async (db) => {
    const memberIds = input.memberIds.filter((m) => m !== input.projectManagerId);
    await assertActiveUsers(db, [...memberIds, ...(input.projectManagerId ? [input.projectManagerId] : [])]);
    const code = input.code || (await nextProjectCode(db));
    const ins = await db.query(
      `insert into "proj-dashboard-projects" (code, name, client_name, main_contractor, consultant, location, description, category, project_manager_id, status,
                             progress, start_date, expected_completion, actual_completion, remarks, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) returning id, code`,
      [code, n.name, n.client_name, n.main_contractor, n.consultant, n.location, n.description, n.category, nul(input.projectManagerId),
       n.status, n.progress, n.start_date, n.expected_completion, n.actual_completion, n.remarks, user.id],
    );
    const { id } = ins.rows[0];
    if (input.contractValue)
      await db.query(`insert into "proj-dashboard-project-financials" (project_id, contract_value, updated_by) values ($1,$2,$3)`, [id, input.contractValue, user.id]);
    if (input.projectManagerId) await upsertManagerMember(db, user, id, input.projectManagerId);
    for (const m of memberIds)
      await db.query(
        `insert into "proj-dashboard-project-members" (project_id, user_id, member_role, can_upload, created_by, updated_by) values ($1,$2,'engineer',true,$3,$3)`,
        [id, m, user.id],
      );
    await logActivity(db, user, {
      action: "project.create", entityType: "project", entityId: id, projectId: id,
      summary: `Created project ${code} – ${n.name}`, next: { code, ...n, projectManagerId: input.projectManagerId || null },
    });
    const link = `/projects/${id}`;
    await notifyUsers(db, user, await companyAudience(db), { type: "project.created", title: "New project created", body: `${code} – ${n.name}`, link, projectId: id });
    await notifyUsers(db, user, [...memberIds, ...(input.projectManagerId ? [input.projectManagerId] : [])], {
      type: "project.assigned", title: "You were assigned to a project", body: `${code} – ${n.name}`, link, projectId: id,
    });
    return { id: id as string, code: ins.rows[0].code as string };
  });
}

export async function updateProject(user: SessionUser, id: string, raw: unknown) {
  const input = parseInput(raw);
  const n = normalise(input);
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select * from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [id])).rows[0];
    if (!cur) throw new NotFoundError();

    const newPm = nul(input.projectManagerId);
    if (newPm !== cur.project_manager_id) {
      assertPerm(user, PERMS.projectAssignManager, "You are not allowed to change the project manager.");
      if (newPm) await assertActiveUsers(db, [newPm]);
    }
    const code = input.code || cur.code;
    const changes = { code, ...n, project_manager_id: newPm };
    const d = diff(cur, changes);

    const finCur = (await db.query(`select contract_value from "proj-dashboard-project-financials" where project_id = $1`, [id])).rows[0];
    if (input.contractValue && !hasPerm(user, PERMS.projectEditContractValue) && Number(input.contractValue) !== Number(finCur?.contract_value))
      throw new ForbiddenError("You are not allowed to change the contract value.");
    const finChanged = hasPerm(user, PERMS.projectEditContractValue) && String(finCur?.contract_value ?? "") !== String(input.contractValue ? Number(input.contractValue).toFixed(2) : "");

    if (!d.changed.length && !finChanged) return { id, changed: [] as string[] };

    const cols = Object.keys(changes);
    const vals = cols.map((c) => (changes as Row)[c]);
    const set = cols.map((c, i) => `${c} = $${i + 3}`).join(", ");
    const u = await db.query(`update "proj-dashboard-projects" set ${set}, updated_by = $2 where id = $1`, [id, user.id, ...vals]);
    if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to edit this project.");

    if (finChanged) {
      if (input.contractValue)
        await db.query(
          `insert into "proj-dashboard-project-financials" (project_id, contract_value, updated_by) values ($1,$2,$3)
           on conflict (project_id) do update set contract_value = excluded.contract_value, updated_by = excluded.updated_by`,
          [id, input.contractValue, user.id],
        );
      else await db.query(`delete from "proj-dashboard-project-financials" where project_id = $1`, [id]);
      d.previous.contract_value = finCur?.contract_value ?? null;
      d.next.contract_value = input.contractValue || null;
      d.changed.push("contract_value");
    }

    if (newPm !== cur.project_manager_id) {
      if (cur.project_manager_id)
        await db.query(
          `update "proj-dashboard-project-members" set member_role = 'engineer', can_edit = false, can_delete_docs = false, can_manage_team = false, updated_by = $3
            where project_id = $1 and user_id = $2`,
          [id, cur.project_manager_id, user.id],
        );
      if (newPm) {
        await upsertManagerMember(db, user, id, newPm);
        await notifyUsers(db, user, [newPm], {
          type: "project.assigned", title: "You are now the project manager", body: `${code} – ${n.name}`, link: `/projects/${id}`, projectId: id,
        });
      }
    }

    const statusChanged = d.changed.includes("status");
    await logActivity(db, user, {
      action: statusChanged ? "project.status_change" : "project.update", entityType: "project", entityId: id, projectId: id,
      summary: statusChanged ? `Status changed from ${cur.status} to ${n.status} on ${code}` : `Updated ${code}: ${d.changed.join(", ")}`,
      previous: d.previous, next: d.next,
    });
    const audience = await projectAudience(db, id);
    await notifyUsers(db, user, audience, statusChanged
      ? { type: "project.status_changed", title: "Project status changed", body: `${code}: ${cur.status} → ${n.status}`, link: `/projects/${id}`, projectId: id }
      : { type: "project.updated", title: "Project details updated", body: `${code} – ${d.changed.join(", ")}`, link: `/projects/${id}`, projectId: id });
    return { id, changed: d.changed };
  });
}

export async function setProjectArchived(user: SessionUser, id: string, archived: boolean) {
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select code, name, is_archived from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [id])).rows[0];
    if (!cur) throw new NotFoundError();
    const u = await db.query(
      `update "proj-dashboard-projects" set is_archived = $2, archived_at = case when $2 then now() else null end, updated_by = $3 where id = $1`,
      [id, archived, user.id],
    );
    if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to archive this project.");
    await logActivity(db, user, {
      action: archived ? "project.archive" : "project.unarchive", entityType: "project", entityId: id, projectId: id,
      summary: `${archived ? "Archived" : "Restored from archive"}: ${cur.code} – ${cur.name}`,
      previous: { is_archived: cur.is_archived }, next: { is_archived: archived },
    });
  });
}

/** Soft delete. Refused when the project still owns documents (archive instead). */
export async function deleteProject(user: SessionUser, id: string) {
  assertPerm(user, PERMS.projectDelete);
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select code, name from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [id])).rows[0];
    if (!cur) throw new NotFoundError();
    const docs = (await db.query(`select count(*)::int as n from "proj-dashboard-documents" where project_id = $1`, [id])).rows[0].n;
    if (docs > 0)
      throw new ConflictError(`This project contains ${docs} document record(s). Archive it instead, or remove its documents permanently first.`);
    const u = await db.query(`update "proj-dashboard-projects" set deleted_at = now(), updated_by = $2 where id = $1`, [id, user.id]);
    if (u.rowCount === 0) throw new ForbiddenError();
    await logActivity(db, user, {
      action: "project.delete", entityType: "project", entityId: id, projectId: id,
      summary: `Deleted project ${cur.code} – ${cur.name}`, previous: { deleted: false }, next: { deleted: true },
    });
  });
}

export async function listDeletedProjects(user: SessionUser) {
  assertPerm(user, PERMS.projectDelete);
  return withUser(user.id, async (db) =>
    (await db.query(`select id, code, name, deleted_at from "proj-dashboard-projects" where deleted_at is not null order by deleted_at desc limit 200`)).rows.map((r) => ({
      id: r.id as string, code: r.code as string, name: r.name as string, deletedAt: r.deleted_at as string,
    })),
  );
}

export async function restoreProject(user: SessionUser, id: string) {
  assertPerm(user, PERMS.projectDelete);
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select code, name from "proj-dashboard-projects" where id = $1 and deleted_at is not null`, [id])).rows[0];
    if (!cur) throw new NotFoundError();
    const u = await db.query(`update "proj-dashboard-projects" set deleted_at = null, updated_by = $2 where id = $1`, [id, user.id]);
    if (u.rowCount === 0) throw new ForbiddenError();
    await logActivity(db, user, { action: "project.restore", entityType: "project", entityId: id, projectId: id, summary: `Restored project ${cur.code} – ${cur.name}` });
  });
}

// ---------------------------------------------------------------- cover image
function sniffImage(b: Buffer): { ext: string; mime: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b.subarray(1, 4).toString() === "PNG") return { ext: "png", mime: "image/png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function setProjectCover(user: SessionUser, id: string, data: Buffer) {
  if (data.length > MAX_COVER_BYTES) throw new ValidationError("Cover image must be 3 MB or smaller.");
  const kind = sniffImage(data);
  if (!kind) throw new ValidationError("Cover must be a PNG, JPEG or WebP image.");
  const key = `projects/${id}/cover-${crypto.randomBytes(6).toString("hex")}.${kind.ext}`;
  let old: string | null = null;
  try {
    await withUser(user.id, async (db) => {
      const cur = (await db.query(`select cover_key from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [id])).rows[0];
      if (!cur) throw new NotFoundError();
      old = cur.cover_key;
      const u = await db.query(`update "proj-dashboard-projects" set cover_key = $2, cover_mime = $3, updated_by = $4 where id = $1`, [id, key, kind.mime, user.id]);
      if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to edit this project.");
      await getStorage().put(key, data, kind.mime);
      await logActivity(db, user, { action: "project.cover", entityType: "project", entityId: id, projectId: id, summary: "Updated project cover image" });
    });
  } catch (e) {
    await getStorage().delete(key).catch(() => undefined);
    throw e;
  }
  if (old) {
    await sysQuery(`insert into "proj-dashboard-storage-deletions" (storage_key) values ($1)`, [old]);
    await deleteStoredFiles([old]);
  }
}

export async function getProjectCover(user: SessionUser, id: string) {
  const row = await withUser(user.id, async (db) => (await db.query(`select cover_key, cover_mime from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [id])).rows[0]);
  if (!row?.cover_key) throw new NotFoundError();
  return { data: await getStorage().get(row.cover_key), mime: row.cover_mime as string };
}

/** Active project categories / disciplines (managed in the database, see docs/DATA-QUERIES.sql). */
export async function listProjectCategories(user: SessionUser): Promise<string[]> {
  return withUser(user.id, async (db) =>
    (await db.query(`select name from "proj-dashboard-project-categories" where is_active order by sort_order, name`)).rows.map((r) => r.name as string),
  );
}
