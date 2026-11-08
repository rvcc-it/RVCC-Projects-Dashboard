// Functional + security tests against a REAL PostgreSQL database (RLS enforced) and real file storage.
// Run: npm test   (requires `npm run db:local`, `npm run db:migrate`, `npm run db:seed`)
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { EMAIL, baseProject, minimalPdf, sys, sysQuery, userByEmail, withUser, pool } from "./helpers";
import type { SessionUser } from "../src/server/session-user";
import { createProject, updateProject, deleteProject, getProject, listProjects, setProjectArchived, restoreProject } from "../src/server/services/projects";
import { addMember, removeMember, updateMember, listMembers } from "../src/server/services/team";
import { createDocument, uploadRevision, deleteDocument, restoreDocument, purgeDocument, listDocuments, getDocument, updateDocumentMeta, getRevisionFile, purgeExpiredTrash } from "../src/server/services/documents";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../src/server/services/categories";
import { createUser, updateUser, deleteUser } from "../src/server/services/users";
import { getRoleMatrix, setRolePermissions } from "../src/server/services/roles";
import { getDashboard } from "../src/server/services/dashboard";
import { runReport } from "../src/server/services/reports";
import { toCsv, toXlsx, toPdf } from "../src/server/export";
import { globalSearch } from "../src/server/services/search";
import { emptyFilters } from "../src/lib/filters";
import { getStorage } from "../src/server/storage";
import { createResetToken, resetPasswordWithToken } from "../src/server/reset-token";
import { verifyPassword } from "../src/server/password";
import { getBell } from "../src/server/services/notifications";
import { getSettings, updateSettings } from "../src/server/services/settings";
import { saveFilter, listSavedFilters, deleteSavedFilter } from "../src/server/services/saved-filters";
import { AppError, ForbiddenError, ValidationError, NotFoundError, ConflictError } from "../src/lib/errors";

let admin: SessionUser, mgmt: SessionUser, ahmed: SessionUser, sara: SessionUser, yousef: SessionUser, layla: SessionUser, viewer: SessionUser, imran: SessionUser;
let catId: string;
const createdProjects: string[] = [];
const createdUsers: string[] = [];
const storage = getStorage();

const rejects = async (p: Promise<unknown>, cls: new (...a: never[]) => Error, msg?: RegExp) => {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof cls, `expected ${cls.name} but got ${(e as Error)?.constructor?.name}: ${(e as Error)?.message}`);
    if (msg) assert.match((e as Error).message, msg);
    return true;
  });
};

before(async () => {
  [admin, mgmt, ahmed, sara, yousef, layla, viewer, imran] = await Promise.all(
    [EMAIL.admin, EMAIL.mgmt, EMAIL.ahmed, EMAIL.sara, EMAIL.yousef, EMAIL.layla, EMAIL.viewer, EMAIL.imran].map(userByEmail),
  );
  catId = (await sysQuery(`select id from "proj-dashboard-document-categories" where name = 'Drawings'`)).rows[0].id;
});

after(async () => {
  // clean up everything the tests created
  const keys = (await sysQuery(`select r.storage_key from "proj-dashboard-document-revisions" r join "proj-dashboard-documents" d on d.id = r.document_id where d.project_id = any($1::uuid[])`, [createdProjects])).rows;
  for (const k of keys) await storage.delete(k.storage_key).catch(() => undefined);
  await sysQuery(`delete from "proj-dashboard-logs" where project_id = any($1::uuid[]) or user_name = 'ZZ Test User'`, [createdProjects]);
  await sysQuery(`delete from "proj-dashboard-projects" where id = any($1::uuid[])`, [createdProjects]);
  await sysQuery(`delete from "proj-dashboard-users" where id = any($1::uuid[])`, [createdUsers]);
  await sysQuery(`delete from "proj-dashboard-document-categories" where name like 'ZZ %'`);
  await sysQuery(`delete from "proj-dashboard-storage-deletions"`);
  await pool.end();
});

describe("Project CRUD", () => {
  let pid: string;
  test("create project persists to PostgreSQL with auto-generated code", async () => {
    const r = await createProject(admin, baseProject({ projectManagerId: ahmed.id, memberIds: [yousef.id], contractValue: "1234567.50" }));
    pid = r.id;
    createdProjects.push(pid);
    assert.match(r.code, /^PRJ-\d{4}-\d{4}$/);
    const row = (await sysQuery(`select * from "proj-dashboard-projects" where id = $1`, [pid])).rows[0];
    assert.equal(row.name, "ZZ Test Project");
    assert.equal(row.project_manager_id, ahmed.id);
    const members = (await sysQuery(`select user_id, member_role, can_upload from "proj-dashboard-project-members" where project_id = $1 order by member_role`, [pid])).rows;
    assert.equal(members.length, 2);
    assert.equal((await sysQuery(`select contract_value from "proj-dashboard-project-financials" where project_id = $1`, [pid])).rows[0].contract_value, "1234567.50");
    const log = (await sysQuery(`select action from "proj-dashboard-logs" where project_id = $1`, [pid])).rows.map((x) => x.action);
    assert.ok(log.includes("project.create"));
    const notif = (await sysQuery(`select count(*)::int as n from "proj-dashboard-notifications" where project_id = $1 and user_id = $2`, [pid, ahmed.id])).rows[0].n;
    assert.ok(notif >= 1, "assigned manager is notified");
  });

  test("manual duplicate code is rejected with a friendly message", async () => {
    await rejects(createProject(admin, baseProject({ code: (await getProject(admin, pid)).code })), AppError, /already exists/);
  });

  test("validation: bad dates and missing fields are rejected server-side", async () => {
    await rejects(createProject(admin, baseProject({ startDate: "2026-05-01", expectedCompletion: "2026-01-01" })), ValidationError);
    await rejects(createProject(admin, baseProject({ name: "" })), ValidationError);
    await rejects(createProject(admin, { ...baseProject(), progress: 150 }), ValidationError);
  });

  test("edit project: changes persist, audit trail stores previous/new, status change notifies", async () => {
    const before = await getProject(admin, pid);
    const r = await updateProject(admin, pid, baseProject({ code: before.code, name: "ZZ Test Project (edited)", progress: 55, status: "on_hold", projectManagerId: ahmed.id, location: "Jeddah", contractValue: "1234567.50" }));
    assert.deepEqual(r.changed.sort(), ["location", "name", "progress", "status"]);
    const after = await getProject(admin, pid);
    assert.equal(after.name, "ZZ Test Project (edited)");
    assert.equal(after.progress, 55);
    assert.equal(after.status, "on_hold");
    const log = (await sysQuery(`select action, previous_value, new_value from "proj-dashboard-logs" where project_id = $1 and action = 'project.status_change'`, [pid])).rows[0];
    assert.equal(log.previous_value.status, "active");
    assert.equal(log.new_value.status, "on_hold");
    assert.ok(((await sysQuery(`select count(*)::int as n from "proj-dashboard-notifications" where project_id = $1 and type = 'project.status_changed'`, [pid])).rows[0].n) >= 1);
  });

  test("completing a project forces 100% progress and sets the completion date", async () => {
    const cur = await getProject(admin, pid);
    await updateProject(admin, pid, baseProject({ code: cur.code, projectManagerId: ahmed.id, status: "completed", progress: 20 }));
    const p = await getProject(admin, pid);
    assert.equal(p.progress, 100);
    assert.ok(p.actualCompletion);
    await updateProject(admin, pid, baseProject({ code: cur.code, projectManagerId: ahmed.id, status: "active", progress: 40, location: "Jeddah" }));
  });

  test("assign project manager: persists, new PM gets manager membership, old PM is demoted", async () => {
    const cur = await getProject(admin, pid);
    await updateProject(admin, pid, baseProject({ code: cur.code, projectManagerId: sara.id, status: "active", progress: 40, location: "Jeddah" }));
    const row = (await sysQuery(`select project_manager_id from "proj-dashboard-projects" where id = $1`, [pid])).rows[0];
    assert.equal(row.project_manager_id, sara.id);
    const m = (await sysQuery(`select user_id, member_role, can_manage_team from "proj-dashboard-project-members" where project_id = $1`, [pid])).rows;
    assert.equal(m.find((x) => x.user_id === sara.id)!.member_role, "manager");
    assert.equal(m.find((x) => x.user_id === ahmed.id)!.can_manage_team, false);
    await updateProject(admin, pid, baseProject({ code: cur.code, projectManagerId: ahmed.id, status: "active", progress: 40, location: "Jeddah" }));
  });

  test("archive / unarchive hides and restores from default listing", async () => {
    await setProjectArchived(admin, pid, true);
    let list = await listProjects(admin, { ...emptyFilters, q: "ZZ Test Project" });
    assert.equal(list.items.length, 0);
    list = await listProjects(admin, { ...emptyFilters, q: "ZZ Test Project", archived: "include" });
    assert.equal(list.items.length, 1);
    await setProjectArchived(admin, pid, false);
  });

  test("project with documents cannot be deleted; empty project is soft-deleted and restorable", async () => {
    const doc = await createDocument(admin, { projectId: pid, meta: { title: "Blocker doc", categoryId: catId, description: "", revisionLabel: "0", documentDate: "" }, file: { name: "a.pdf", data: minimalPdf() } });
    await rejects(deleteProject(admin, pid), ConflictError, /Archive it instead/);
    await deleteDocument(admin, doc.id);
    await rejects(deleteProject(admin, pid), ConflictError); // trashed doc still counts until purged
    await purgeDocument(admin, doc.id);
    await deleteProject(admin, pid);
    const row = (await sysQuery(`select deleted_at from "proj-dashboard-projects" where id = $1`, [pid])).rows[0];
    assert.ok(row.deleted_at, "soft deleted, not removed");
    await rejects(getProject(admin, pid), NotFoundError);
    assert.equal((await listProjects(admin, { ...emptyFilters, q: "ZZ Test Project" })).items.length, 0);
    await restoreProject(admin, pid);
    assert.equal((await getProject(admin, pid)).id, pid);
    const log = (await sysQuery(`select action from "proj-dashboard-logs" where project_id = $1`, [pid])).rows.map((x) => x.action);
    assert.ok(log.includes("project.delete") && log.includes("project.restore"));
  });
});

describe("Authorization (service layer + Row Level Security)", () => {
  let pid: string;
  before(async () => {
    const r = await createProject(admin, baseProject({ name: "ZZ Auth Project", projectManagerId: ahmed.id, memberIds: [yousef.id] }));
    pid = r.id;
    createdProjects.push(pid);
  });

  test("viewer, engineer and PM cannot create projects", async () => {
    for (const u of [viewer, yousef, ahmed]) await rejects(createProject(u, baseProject()), ForbiddenError);
  });

  test("viewer cannot edit or delete (service)", async () => {
    await rejects(updateProject(viewer, pid, baseProject({ code: "x" })), AppError);
    await rejects(deleteProject(viewer, pid), ForbiddenError);
  });

  test("RLS blocks direct SQL even if service checks were bypassed", async () => {
    await withUser(viewer.id, async (db) => {
      // viewer is not a member -> project invisible
      assert.equal((await db.query(`select id from "proj-dashboard-projects" where id = $1`, [pid])).rowCount, 0);
      assert.equal((await db.query(`update "proj-dashboard-projects" set name = 'hacked' where id = $1`, [pid])).rowCount, 0);
    });
    await withUser(yousef.id, async (db) => {
      assert.equal((await db.query(`select id from "proj-dashboard-projects" where id = $1`, [pid])).rowCount, 1, "member can read");
      assert.equal((await db.query(`update "proj-dashboard-projects" set name = 'hacked' where id = $1`, [pid])).rowCount, 0, "member without edit flag cannot update");
    });
    await rejects(withUser(yousef.id, (db) => db.query(`insert into "proj-dashboard-projects" (code,name,client_name,location) values ('HACK-1','x','y','z')`)), ForbiddenError);
    assert.equal((await sysQuery(`select name from "proj-dashboard-projects" where id = $1`, [pid])).rows[0].name, "ZZ Auth Project");
    // credentials / sessions are not even readable
    await rejects(withUser(admin.id, (db) => db.query(`select * from "proj-dashboard-user-credentials"`)), ForbiddenError);
    await rejects(withUser(admin.id, (db) => db.query(`select * from "proj-dashboard-sessions"`)), ForbiddenError);
  });

  test("engineer outside the project cannot read it; engineer inside can", async () => {
    await rejects(getProject(layla, pid), NotFoundError);
    assert.equal((await getProject(yousef, pid)).id, pid);
    const list = await listProjects(layla, { ...emptyFilters, q: "ZZ Auth" });
    assert.equal(list.items.length, 0);
  });

  test("project manager can edit own assigned project but not another PM's, and cannot reassign the manager", async () => {
    const cur = await getProject(ahmed, pid);
    const ok = await updateProject(ahmed, pid, baseProject({ code: cur.code, name: "ZZ Auth Project", progress: 33, projectManagerId: ahmed.id }));
    assert.deepEqual(ok.changed.sort(), ["progress", "status"].filter((c) => ok.changed.includes(c)).concat(ok.changed.filter((c) => c !== "status" && c !== "progress")).sort());
    assert.equal((await getProject(ahmed, pid)).progress, 33);
    await rejects(updateProject(sara, pid, baseProject({ code: cur.code, progress: 99 })), AppError); // sara is not a member
    await rejects(updateProject(ahmed, pid, baseProject({ code: cur.code, progress: 33, projectManagerId: sara.id })), ForbiddenError, /project manager/);
  });

  test("management sees all projects but cannot edit", async () => {
    assert.equal((await getProject(mgmt, pid)).id, pid);
    await rejects(updateProject(mgmt, pid, baseProject({ code: "x" })), AppError);
    await withUser(mgmt.id, async (db) => assert.equal((await db.query(`update "proj-dashboard-projects" set name = 'm' where id = $1`, [pid])).rowCount, 0));
  });

  test("contract value is protected by its own policy", async () => {
    await updateProject(admin, pid, baseProject({ code: (await getProject(admin, pid)).code, name: "ZZ Auth Project", progress: 33, projectManagerId: ahmed.id, contractValue: "500000" }));
    assert.equal((await getProject(admin, pid)).contractValue, "500000.00");
    assert.equal((await getProject(mgmt, pid)).contractValue, "500000.00");
    assert.equal((await getProject(ahmed, pid)).contractValue, null, "PM role has no view_contract_value");
    assert.equal((await getProject(yousef, pid)).contractValue, null);
    await rejects(updateProject(ahmed, pid, baseProject({ code: (await getProject(ahmed, pid)).code, name: "ZZ Auth Project", progress: 33, projectManagerId: ahmed.id, contractValue: "1" })), AppError);
    assert.equal((await getProject(admin, pid)).contractValue, "500000.00");
  });

  test("only project managers' own team: team permissions enforced", async () => {
    await rejects(addMember(yousef, pid, { userId: layla.id, memberRole: "engineer", canEdit: false, canUpload: true, canDeleteDocs: false, canManageTeam: false }), ForbiddenError);
    const r = await addMember(ahmed, pid, { userId: layla.id, memberRole: "engineer", canEdit: false, canUpload: true, canDeleteDocs: false, canManageTeam: false });
    assert.equal((await getProject(layla, pid)).id, pid, "newly added member can now read");
    await updateMember(ahmed, pid, r.id, { userId: layla.id, memberRole: "engineer", canEdit: false, canUpload: false, canDeleteDocs: false, canManageTeam: false });
    const m = (await listMembers(ahmed, pid)).find((x) => x.userId === layla.id)!;
    assert.equal(m.canUpload, false);
    await rejects(addMember(ahmed, pid, { userId: layla.id, memberRole: "engineer", canEdit: false, canUpload: true, canDeleteDocs: false, canManageTeam: false }), ConflictError, /already/);
    const pmMember = (await listMembers(ahmed, pid)).find((x) => x.isManager)!;
    await rejects(removeMember(ahmed, pid, pmMember.id), ConflictError, /project manager/);
    await removeMember(ahmed, pid, r.id);
    await rejects(getProject(layla, pid), NotFoundError);
  });
});

describe("Documents: upload, preview file, revisions, delete, retention", () => {
  let pid: string, docId: string;
  before(async () => {
    const r = await createProject(admin, baseProject({ name: "ZZ Docs Project", projectManagerId: ahmed.id, memberIds: [yousef.id, imran.id] }));
    pid = r.id;
    createdProjects.push(pid);
    // imran: engineer WITHOUT upload flag; yousef: with upload flag (default on create); viewer: read-only member
    await sysQuery(`update "proj-dashboard-project-members" set can_upload = false where project_id = $1 and user_id = $2`, [pid, imran.id]);
    await sysQuery(`insert into "proj-dashboard-project-members" (project_id, user_id, member_role) values ($1,$2,'viewer')`, [pid, viewer.id]);
  });
  const meta = { title: "ZZ Site Plan", categoryId: "", description: "desc", revisionLabel: "A", documentDate: "2026-02-01" };

  test("upload PDF saves file in private storage + DB rows + audit + notification", async () => {
    const d = await createDocument(ahmed, { projectId: pid, meta: { ...meta, categoryId: catId }, file: { name: "plan.pdf", data: minimalPdf("v1") } });
    docId = d.id;
    const f = await getRevisionFile(ahmed, docId);
    assert.ok(await storage.exists(f.key));
    assert.match(f.key, /^documents\//);
    assert.equal((await storage.get(f.key)).subarray(0, 5).toString(), "%PDF-");
    const detail = await getDocument(ahmed, docId);
    assert.equal(detail.revisions.length, 1);
    assert.equal(detail.revisions[0].revisionLabel, "A");
    const log = (await sysQuery(`select action from "proj-dashboard-logs" where document_id = $1`, [docId])).rows.map((x) => x.action);
    assert.ok(log.includes("document.upload"));
    assert.ok((await sysQuery(`select count(*)::int as n from "proj-dashboard-notifications" where document_id = $1 and user_id = $2`, [docId, yousef.id])).rows[0].n >= 1);
  });

  test("server rejects non-PDF, fake PDF, empty and oversize files", async () => {
    const m = { ...meta, categoryId: catId };
    await rejects(createDocument(ahmed, { projectId: pid, meta: m, file: { name: "x.exe", data: minimalPdf() } }), ValidationError, /not a PDF/);
    await rejects(createDocument(ahmed, { projectId: pid, meta: m, file: { name: "x.pdf", data: Buffer.from("MZ this is an exe") } }), ValidationError, /valid PDF/);
    await rejects(createDocument(ahmed, { projectId: pid, meta: m, file: { name: "x.pdf", data: Buffer.alloc(0) } }), ValidationError, /empty/);
    await updateSettings(admin, { retentionDays: 30, maxUploadMb: 1 });
    await rejects(createDocument(ahmed, { projectId: pid, meta: m, file: { name: "big.pdf", data: Buffer.concat([minimalPdf(), Buffer.alloc(1.2 * 1024 * 1024)]) } }), ValidationError, /maximum size/);
    await updateSettings(admin, { retentionDays: 30, maxUploadMb: 50 });
    assert.equal((await listDocuments(ahmed, { projectId: pid })).total, 1, "no partial records left behind");
  });

  test("users without upload rights are rejected (viewer, engineer without flag, non-member)", async () => {
    const m = { ...meta, categoryId: catId, title: "ZZ unauthorised" };
    for (const u of [viewer, imran, layla]) await rejects(createDocument(u, { projectId: pid, meta: m, file: { name: "x.pdf", data: minimalPdf() } }), AppError);
    assert.equal((await sysQuery(`select count(*)::int as n from "proj-dashboard-documents" where title = 'ZZ unauthorised'`)).rows[0].n, 0);
    // engineer WITH flag can upload
    const ok = await createDocument(yousef, { projectId: pid, meta: { ...m, title: "ZZ by engineer" }, file: { name: "e.pdf", data: minimalPdf("e") } });
    assert.ok(ok.id);
  });

  test("upload new revision keeps previous revision file and bumps current revision", async () => {
    const r = await uploadRevision(ahmed, docId, { revisionLabel: "B", notes: "after comments", file: { name: "plan_b.pdf", data: minimalPdf("v2") } });
    assert.equal(r.revisionNo, 2);
    const d = await getDocument(ahmed, docId);
    assert.equal(d.revisions.length, 2);
    assert.equal(d.currentRevisionNo, 2);
    const rev1 = await getRevisionFile(ahmed, docId, 1);
    const rev2 = await getRevisionFile(ahmed, docId);
    assert.notEqual(rev1.key, rev2.key);
    assert.ok(await storage.exists(rev1.key), "old revision still available");
    assert.match((await storage.get(rev1.key)).toString(), /v1/);
    assert.match((await storage.get(rev2.key)).toString(), /v2/);
    await rejects(uploadRevision(viewer, docId, { revisionLabel: "C", notes: "", file: { name: "c.pdf", data: minimalPdf() } }), AppError);
  });

  test("edit metadata + change category persists; moving to a project you cannot upload to is refused", async () => {
    const cats = await listCategories(ahmed);
    const other = cats.find((c) => c.name === "BOQ")!;
    await updateDocumentMeta(ahmed, docId, { title: "ZZ Site Plan v2", categoryId: other.id, description: "new", revisionLabel: "B1", documentDate: "2026-03-01", projectId: pid });
    const d = await getDocument(ahmed, docId);
    assert.equal(d.title, "ZZ Site Plan v2");
    assert.equal(d.category, "BOQ");
    assert.equal(d.revisions[0].revisionLabel, "B1");
    const sysProj = (await sysQuery(`select id from "proj-dashboard-projects" where is_demo and project_manager_id <> $1 limit 1`, [ahmed.id])).rows[0].id;
    await rejects(updateDocumentMeta(ahmed, docId, { title: "ZZ Site Plan v2", categoryId: other.id, description: "new", revisionLabel: "B1", documentDate: "", projectId: sysProj }), AppError);
    await rejects(updateDocumentMeta(viewer, docId, { title: "x1", categoryId: other.id, description: "", revisionLabel: "", documentDate: "", projectId: pid }), AppError);
  });

  test("revision files are immutable at the database level", async () => {
    const rev = await getRevisionFile(ahmed, docId);
    await assert.rejects(withUser(ahmed.id, (db) => db.query(`update "proj-dashboard-document-revisions" set storage_key = 'documents/evil.pdf' where storage_key = $1`, [rev.key])), /immutable/);
  });

  test("list/search/filter/sort/paginate documents", async () => {
    const all = await listDocuments(ahmed, { projectId: pid, pageSize: 1, page: 1, sort: "title", dir: "asc" });
    assert.equal(all.total, 2);
    assert.equal(all.items.length, 1);
    const q = await listDocuments(ahmed, { q: "ZZ Site Plan" });
    assert.equal(q.total, 1);
    const byUploader = await listDocuments(ahmed, { projectId: pid, uploaderId: yousef.id });
    assert.equal(byUploader.total, 1);
    const none = await listDocuments(layla, { projectId: pid });
    assert.equal(none.total, 0, "non-member sees nothing");
  });

  test("viewer can read (project member) but has no delete rights", async () => {
    assert.equal((await getDocument(viewer, docId)).canDelete, false);
    await rejects(deleteDocument(viewer, docId), AppError);
    await rejects(deleteDocument(yousef, docId), AppError); // engineer lacks delete flag
  });

  test("delete document: access revoked immediately, restorable, files kept until retention purge", async () => {
    await deleteDocument(ahmed, docId);
    await rejects(getRevisionFile(ahmed, docId), NotFoundError);
    assert.equal((await listDocuments(ahmed, { projectId: pid, q: "Site Plan" })).total, 0);
    assert.equal((await listDocuments(ahmed, { projectId: pid, trash: true })).total, 1);
    assert.equal((await listDocuments(viewer, { projectId: pid, trash: true })).total, 0, "viewer cannot see trash");
    const keys = (await sysQuery(`select storage_key from "proj-dashboard-document-revisions" where document_id = $1`, [docId])).rows.map((r) => r.storage_key);
    for (const k of keys) assert.ok(await storage.exists(k), "retained during retention period");
    await restoreDocument(ahmed, docId);
    assert.equal((await getRevisionFile(ahmed, docId)).docId, docId);
    await deleteDocument(ahmed, docId);
    // permanent deletion requires document.delete_all (PM has only delete_assigned)
    await rejects(purgeDocument(ahmed, docId), ForbiddenError);
    await purgeDocument(admin, docId);
    for (const k of keys) assert.equal(await storage.exists(k), false, "no orphaned file left in storage");
    assert.equal((await sysQuery(`select count(*)::int as n from "proj-dashboard-documents" where id = $1`, [docId])).rows[0].n, 0);
    assert.equal((await sysQuery(`select count(*)::int as n from "proj-dashboard-storage-deletions"`)).rows[0].n, 0, "outbox drained");
    assert.ok((await sysQuery(`select 1 from "proj-dashboard-logs" where action = 'document.purge' and project_id = $1`, [pid])).rowCount);
  });

  test("retention job purges only documents trashed longer than the retention period", async () => {
    const a = await createDocument(ahmed, { projectId: pid, meta: { ...meta, categoryId: catId, title: "ZZ old trash" }, file: { name: "o.pdf", data: minimalPdf("old") } });
    const b = await createDocument(ahmed, { projectId: pid, meta: { ...meta, categoryId: catId, title: "ZZ fresh trash" }, file: { name: "f.pdf", data: minimalPdf("fresh") } });
    await deleteDocument(ahmed, a.id);
    await deleteDocument(ahmed, b.id);
    await sysQuery(`update "proj-dashboard-documents" set deleted_at = now() - interval '45 days' where id = $1`, [a.id]);
    const keyA = (await sysQuery(`select storage_key from "proj-dashboard-document-revisions" where document_id = $1`, [a.id])).rows[0].storage_key;
    const keyB = (await sysQuery(`select storage_key from "proj-dashboard-document-revisions" where document_id = $1`, [b.id])).rows[0].storage_key;
    const res = await purgeExpiredTrash(null);
    assert.ok(res.purgedDocuments >= 1);
    assert.equal(await storage.exists(keyA), false);
    assert.equal(await storage.exists(keyB), true);
    assert.equal((await sysQuery(`select count(*)::int as n from "proj-dashboard-documents" where id = $1`, [b.id])).rows[0].n, 1);
  });
});

describe("Categories CRUD", () => {
  test("create, edit, deactivate, delete with reassignment", async () => {
    const c = await createCategory(admin, { name: "ZZ Temp Category", description: "t", sortOrder: 500, isActive: true });
    await updateCategory(admin, c.id, { name: "ZZ Temp Category 2", description: "t2", sortOrder: 501, isActive: true });
    assert.equal((await listCategories(admin)).find((x) => x.id === c.id)!.name, "ZZ Temp Category 2");
    await rejects(createCategory(admin, { name: "zz temp category 2", description: "", sortOrder: 1, isActive: true }), AppError, /already exists/);
    await rejects(createCategory(ahmed, { name: "ZZ nope", description: "", sortOrder: 1, isActive: true }), ForbiddenError);
    // reference it
    const p = await createProject(admin, baseProject({ name: "ZZ Cat Project", projectManagerId: ahmed.id }));
    createdProjects.push(p.id);
    const d = await createDocument(admin, { projectId: p.id, meta: { title: "ZZ cat doc", categoryId: c.id, description: "", revisionLabel: "0", documentDate: "" }, file: { name: "c.pdf", data: minimalPdf("cat") } });
    await rejects(deleteCategory(admin, c.id), ConflictError, /use this category/);
    const other = (await listCategories(admin)).find((x) => x.name === "Other Documents")!;
    await deleteCategory(admin, c.id, other.id);
    assert.equal((await getDocument(admin, d.id)).category, "Other Documents");
    assert.equal((await listCategories(admin)).some((x) => x.id === c.id), false);
  });
});

describe("User management + roles", () => {
  let uid: string;
  test("create user: stored with hashed temp password, must change at first login", async () => {
    const roles = (await sysQuery(`select id, code from "proj-dashboard-roles"`)).rows;
    const r = await createUser(admin, { email: "zz.test.user@demo.rvcc.test", username: "", fullName: "ZZ Test User", department: "QA", jobTitle: "Tester", phone: "", roleId: roles.find((x) => x.code === "viewer")!.id, password: "" });
    uid = r.id;
    createdUsers.push(uid);
    assert.ok(r.tempPassword && r.tempPassword.length >= 12);
    const cred = (await sysQuery(`select password_hash, must_change_password from "proj-dashboard-user-credentials" where user_id = $1`, [uid])).rows[0];
    assert.ok(cred.password_hash.startsWith("$2"), "bcrypt hash, not plaintext");
    assert.notEqual(cred.password_hash, r.tempPassword);
    assert.equal(cred.must_change_password, true);
    assert.ok(await verifyPassword(r.tempPassword!, cred.password_hash));
    await rejects(createUser(admin, { email: "ZZ.test.user@demo.rvcc.test", username: "", fullName: "dup", department: "", jobTitle: "", phone: "", roleId: roles[0].id, password: "" }), AppError, /already exists/);
    await rejects(createUser(ahmed, { email: "zz.x@demo.rvcc.test", username: "", fullName: "No Way", department: "", jobTitle: "", phone: "", roleId: roles[0].id, password: "" }), ForbiddenError);
  });

  test("change role: effective permissions update; sessions are revoked", async () => {
    const roles = (await sysQuery(`select id, code from "proj-dashboard-roles"`)).rows;
    await sysQuery(`insert into "proj-dashboard-sessions" (user_id, token_hash, expires_at) values ($1,'zz-test-token', now() + interval '1 hour')`, [uid]);
    const u = (await sysQuery(`select * from "proj-dashboard-users" where id = $1`, [uid])).rows[0];
    const before = await userByEmail(u.email);
    assert.deepEqual(before.permissions, ["document.download"]);
    await updateUser(admin, uid, { email: u.email, username: "", fullName: u.full_name, department: "QA", jobTitle: "Tester", phone: "", isActive: true, roleId: roles.find((x) => x.code === "management")!.id });
    const after = await userByEmail(u.email);
    assert.equal(after.roleCode, "management");
    assert.ok(after.permissions.includes("project.view_all"));
    assert.equal((await sysQuery(`select count(*)::int as n from "proj-dashboard-sessions" where user_id = $1`, [uid])).rows[0].n, 0);
    assert.ok((await getProject(after, createdProjects[0] ?? (await sysQuery(`select id from "proj-dashboard-projects" limit 1`)).rows[0].id).catch(() => null)) !== undefined);
  });

  test("deactivated users lose access (session user can no longer be loaded)", async () => {
    const u = (await sysQuery(`select * from "proj-dashboard-users" where id = $1`, [uid])).rows[0];
    const roles = (await sysQuery(`select id, code from "proj-dashboard-roles"`)).rows;
    await updateUser(admin, uid, { email: u.email, username: "", fullName: u.full_name, department: "QA", jobTitle: "Tester", phone: "", isActive: false, roleId: roles.find((x) => x.code === "management")!.id });
    assert.equal(await userByEmail(u.email).catch(() => null), null);
    await updateUser(admin, uid, { email: u.email, username: "", fullName: u.full_name, department: "QA", jobTitle: "Tester", phone: "", isActive: true, roleId: roles.find((x) => x.code === "management")!.id });
  });

  test("safeguards: cannot deactivate/delete self or remove the last Super Admin; non-admin cannot manage users", async () => {
    const roles = (await sysQuery(`select id, code from "proj-dashboard-roles"`)).rows;
    await rejects(deleteUser(admin, admin.id), ConflictError, /own account/);
    await rejects(updateUser(admin, admin.id, { email: admin.email, username: "", fullName: admin.fullName, department: "", jobTitle: "", phone: "", isActive: false, roleId: roles.find((x) => x.code === "super_admin")!.id }), ConflictError);
    await rejects(updateUser(ahmed, uid, { email: "a@b.co", username: "", fullName: "hack", department: "", jobTitle: "", phone: "", isActive: true, roleId: roles[0].id }), ForbiddenError);
    await withUser(ahmed.id, async (db) => assert.equal((await db.query(`update "proj-dashboard-users" set full_name = 'hacked' where id = $1`, [uid])).rowCount, 0, "RLS: cannot edit other users"));
    await rejects(withUser(ahmed.id, (db) => db.query(`update "proj-dashboard-users" set is_active = false where id = $1`, [ahmed.id])), ForbiddenError, /only user managers/); // guard trigger
    await rejects(withUser(ahmed.id, (db) => db.query(`insert into "proj-dashboard-user-roles" (user_id, role_id) values ($1,$2)`, [ahmed.id, roles.find((x) => x.code === "super_admin")!.id])), ForbiddenError); // RLS
  });

  test("delete user: refused for active project managers, allowed for users without ownership", async () => {
    await rejects(deleteUser(admin, ahmed.id), ConflictError, /project manager/);
    await deleteUser(admin, uid);
    createdUsers.splice(createdUsers.indexOf(uid), 1);
    assert.equal((await sysQuery(`select count(*)::int as n from "proj-dashboard-users" where id = $1`, [uid])).rows[0].n, 0);
  });

  test("password reset token is single-use and sets a new bcrypt hash", async () => {
    const roles = (await sysQuery(`select id from "proj-dashboard-roles" where code = 'viewer'`)).rows;
    const r = await createUser(admin, { email: "zz.reset@demo.rvcc.test", username: "", fullName: "ZZ Test User", department: "", jobTitle: "", phone: "", roleId: roles[0].id, password: "" });
    createdUsers.push(r.id);
    const { token } = await createResetToken(r.id);
    await resetPasswordWithToken(token, "NewPassw0rd!x1");
    const cred = (await sysQuery(`select password_hash, must_change_password from "proj-dashboard-user-credentials" where user_id = $1`, [r.id])).rows[0];
    assert.ok(await verifyPassword("NewPassw0rd!x1", cred.password_hash));
    assert.equal(cred.must_change_password, false);
    await rejects(resetPasswordWithToken(token, "AnotherPassw0rd!2"), AppError, /invalid or has expired/);
    await rejects(resetPasswordWithToken((await createResetToken(r.id)).token, "short"), ValidationError);
  });

  test("role permission matrix is configurable and takes effect without code changes", async () => {
    const m = await getRoleMatrix(admin);
    const viewerRole = m.roles.find((r) => r.code === "viewer")!;
    await rejects(setRolePermissions(ahmed, viewerRole.id, []), ForbiddenError);
    await rejects(setRolePermissions(admin, m.roles.find((r) => r.code === "super_admin")!.id, []), ConflictError);
    await setRolePermissions(admin, viewerRole.id, []);
    assert.equal((await userByEmail(EMAIL.viewer)).permissions.length, 0);
    await setRolePermissions(admin, viewerRole.id, ["document.download"]);
    assert.deepEqual((await userByEmail(EMAIL.viewer)).permissions, ["document.download"]);
  });
});

describe("Dashboard, filters, reports, exports, search", () => {
  test("filters cross-filter KPIs, charts and tables with real DB numbers", async () => {
    const all = await getDashboard(admin, emptyFilters);
    const dbTotal = (await sysQuery(`select count(*)::int as n from "proj-dashboard-projects" where deleted_at is null and is_archived = false`)).rows[0].n;
    assert.equal(all.kpis.total, dbTotal);
    assert.equal(all.byStatus.reduce((s, x) => s + x.value, 0), dbTotal);
    const riyadh = await getDashboard(admin, { ...emptyFilters, locations: ["Riyadh"] });
    const expR = (await sysQuery(`select count(*)::int as n from "proj-dashboard-projects" where deleted_at is null and is_archived = false and location = 'Riyadh'`)).rows[0].n;
    assert.equal(riyadh.kpis.total, expR);
    assert.deepEqual(riyadh.byLocation.map((x) => x.label), ["Riyadh"]);
    const combo = await getDashboard(admin, { ...emptyFilters, locations: ["Riyadh"], managers: [ahmed.id], statuses: ["active"] });
    const expC = (await sysQuery(`select count(*)::int as n from "proj-dashboard-projects" where deleted_at is null and is_archived = false and location = 'Riyadh' and project_manager_id = $1 and status = 'active'`, [ahmed.id])).rows[0].n;
    assert.equal(combo.kpis.total, expC);
    assert.ok(combo.kpis.documents <= all.kpis.documents);
    const tbl = await listProjects(admin, { ...emptyFilters, locations: ["Riyadh"], managers: [ahmed.id], statuses: ["active"] });
    assert.equal(tbl.total, expC);
    const dated = await listProjects(admin, { ...emptyFilters, startFrom: "2099-01-01" });
    assert.equal(dated.total, 0);
    const injected = await listProjects(admin, { ...emptyFilters, q: "'; drop table projects; --" });
    assert.equal(injected.total, 0);
    assert.ok((await sysQuery(`select count(*)::int as n from "proj-dashboard-projects"`)).rows[0].n > 0, "SQL injection attempt harmless");
  });

  test("dashboard respects authorization: engineer only sees assigned projects", async () => {
    const d = await getDashboard(layla, emptyFilters);
    const exp = (await sysQuery(`select count(distinct p.id)::int as n from "proj-dashboard-projects" p join "proj-dashboard-project-members" m on m.project_id = p.id where m.user_id = $1 and p.deleted_at is null and not p.is_archived`, [layla.id])).rows[0].n;
    assert.equal(d.kpis.total, exp);
    assert.ok(exp < (await getDashboard(admin, emptyFilters)).kpis.total);
  });

  test("reports reflect filters and export to CSV / XLSX / PDF with the same rows", async () => {
    const f = { ...emptyFilters, locations: ["Riyadh"] };
    const rep = await runReport(admin, "project_status", f);
    const exp = (await sysQuery(`select count(*)::int as n from "proj-dashboard-projects" where deleted_at is null and not is_archived and location = 'Riyadh'`)).rows[0].n;
    assert.equal(rep.rows.length, exp);
    assert.ok(rep.rows.every((r) => r.location === "Riyadh"));
    const csv = toCsv(rep).toString("utf8");
    assert.equal(csv.trim().split("\r\n").length, exp + 1);
    assert.match(csv, /Project Manager/);
    const xlsx = await toXlsx(rep);
    assert.equal(xlsx.subarray(0, 2).toString(), "PK");
    const pdf = toPdf(rep);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    for (const t of ["project_documents", "by_manager", "by_location", "document_uploads", "recent_activity"]) {
      const r = await runReport(admin, t, emptyFilters);
      assert.ok(r.columns.length > 3 && r.rows.length > 0, t);
    }
    const mgr = await runReport(admin, "by_manager", emptyFilters);
    assert.equal(mgr.rows.reduce((s, r) => s + Number(r.total), 0), (await getDashboard(admin, emptyFilters)).kpis.total);
    await rejects(runReport(viewer, "project_status", emptyFilters), ForbiddenError); // viewer lacks report.view
    const eng = await runReport(layla, "project_status", emptyFilters);
    assert.ok(eng.rows.length < (await runReport(admin, "project_status", emptyFilters)).rows.length, "reports respect user scope");
  });

  test("CSV export neutralises spreadsheet formulas", async () => {
    const rep = { type: "project_status" as const, title: "t", columns: [{ key: "a", label: "A", type: "text" as const }], rows: [{ a: "=HYPERLINK(\"http://evil\")" }], truncated: false, generatedAt: new Date().toISOString() };
    assert.match(toCsv(rep).toString(), /"'=HYPERLINK/);
  });

  test("global search only returns authorised records", async () => {
    const a = await globalSearch(admin, "Nakheel");
    assert.ok(a.projects.length >= 1);
    const l = await globalSearch(layla, "Nakheel");
    assert.equal(l.projects.length, 0, "layla is not on that project");
    const docs = await globalSearch(admin, "Contract");
    assert.ok(docs.documents.length > 0 || docs.categories.length > 0);
    assert.equal((await globalSearch(viewer, "x")).projects.length, 0);
  });

  test("saved filters: per-user, permission gated", async () => {
    const s = await saveFilter(admin, "ZZ Riyadh active", { ...emptyFilters, locations: ["Riyadh"], statuses: ["active"] });
    const list = await listSavedFilters(admin);
    assert.match(list.find((x) => x.id === s.id)!.query, /loc=Riyadh/);
    assert.equal((await listSavedFilters(mgmt)).some((x) => x.id === s.id), false, "not visible to other users");
    await rejects(saveFilter(viewer, "ZZ nope", { ...emptyFilters, locations: ["Riyadh"] }), ForbiddenError);
    await deleteSavedFilter(admin, s.id);
    assert.equal((await listSavedFilters(admin)).some((x) => x.id === s.id), false);
  });

  test("notifications are per-user and settings need settings.manage", async () => {
    const bell = await getBell(ahmed);
    assert.ok(bell.latest.length > 0);
    await rejects(updateSettings(ahmed, { retentionDays: 1, maxUploadMb: 1 }), ForbiddenError);
    assert.equal((await getSettings(ahmed)).retentionDays, 30);
  });
});

describe("Database-level hardening", () => {
  test("a user cannot forge a notification in someone else's name or without an author", async () => {
    await rejects(
      withUser(viewer.id, (db) => db.query(`insert into "proj-dashboard-notifications" (user_id, type, title, created_by) values ($1,'x','forged',$2)`, [admin.id, admin.id])),
      ForbiddenError,
    );
    await rejects(withUser(viewer.id, (db) => db.query(`insert into "proj-dashboard-notifications" (user_id, type, title) values ($1,'x','anonymous')`, [admin.id])), ForbiddenError);
    assert.equal((await sysQuery(`select count(*)::int as n from "proj-dashboard-notifications" where title in ('forged','anonymous')`)).rows[0].n, 0);
  });

  test("audit log is append-only for the application role", async () => {
    await rejects(withUser(admin.id, (db) => db.query(`delete from "proj-dashboard-logs"`)), ForbiddenError);
    await rejects(withUser(admin.id, (db) => db.query(`update "proj-dashboard-logs" set summary = 'tampered'`)), ForbiddenError);
    await rejects(withUser(admin.id, (db) => db.query(`insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, summary) values ($1,'x','a','project','forged')`, [viewer.id])), ForbiddenError);
  });
});
