import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { sys, withUser, type Db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { PERMS } from "@/lib/permissions";
import { documentMetaSchema } from "@/lib/validators";
import { assertPerm, type SessionUser } from "@/server/session-user";
import { diff, logActivity, notifyUsers, projectAudience } from "@/server/activity";
import { getStorage } from "@/server/storage";
import { deleteStoredFiles } from "@/server/cleanup";

export type DocListItem = {
  id: string; title: string; projectId: string; projectName: string; projectCode: string; categoryId: string; category: string;
  revisionNo: number; revisionLabel: string; fileName: string; fileSize: number; uploadedAt: string; uploaderId: string | null; uploaderName: string | null;
  documentDate: string | null; deletedAt: string | null; canUpload: boolean; canDelete: boolean;
};

export type DocFilters = {
  q?: string; projectId?: string; categoryId?: string; uploaderId?: string; from?: string; to?: string;
  sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number; trash?: boolean;
};

const SORTS: Record<string, string> = {
  title: "d.title", project: "p.name", category: "c.name", revision: "d.current_revision_no", uploader: "up.full_name",
  date: "r.created_at", size: "r.file_size",
};

const esc = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUuid = (s?: string) => !!s && /^[0-9a-f-]{36}$/i.test(s);

export async function listDocuments(user: SessionUser, f: DocFilters = {}) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, f.pageSize ?? 10));
  const sort = SORTS[f.sort ?? "date"] ?? SORTS.date;
  const dir = f.dir === "asc" ? "asc" : "desc";
  const params: unknown[] = [];
  const add = (v: unknown) => (params.push(v), "$" + params.length);
  const w = ["p.deleted_at is null"];
  w.push(f.trash ? "d.deleted_at is not null and app_can_delete_doc(d.project_id)" : "d.deleted_at is null");
  if (f.q) {
    const t = add("%" + esc(f.q) + "%");
    w.push(`(d.title ilike ${t} or p.name ilike ${t} or p.code ilike ${t} or c.name ilike ${t} or r.file_name ilike ${t})`);
  }
  if (isUuid(f.projectId)) w.push(`d.project_id = ${add(f.projectId)}`);
  if (isUuid(f.categoryId)) w.push(`d.category_id = ${add(f.categoryId)}`);
  if (isUuid(f.uploaderId)) w.push(`r.created_by = ${add(f.uploaderId)}`);
  if (isDate(f.from)) w.push(`r.created_at >= ${add(f.from)}::date`);
  if (isDate(f.to)) w.push(`r.created_at < (${add(f.to)}::date + 1)`);

  return withUser(user.id, async (db) => {
    const r = await db.query(
      `select d.id, d.title, d.project_id, p.name as project_name, p.code as project_code, d.category_id, c.name as category,
              d.current_revision_no, r.revision_label, r.file_name, r.file_size, r.created_at as uploaded_at, r.created_by as uploader_id,
              up.full_name as uploader_name, d.document_date, d.deleted_at,
              app_can_upload(d.project_id) as can_upload, app_can_delete_doc(d.project_id) as can_delete,
              count(*) over()::int as total
         from "proj-dashboard-documents" d
         join "proj-dashboard-projects" p on p.id = d.project_id
         join "proj-dashboard-document-categories" c on c.id = d.category_id
         join "proj-dashboard-document-revisions" r on r.document_id = d.id and r.revision_no = d.current_revision_no
         left join "proj-dashboard-users" up on up.id = r.created_by
        where ${w.join(" and ")}
        order by ${sort} ${dir} nulls last, d.created_at desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    const items: DocListItem[] = r.rows.map((x) => ({
      id: x.id, title: x.title, projectId: x.project_id, projectName: x.project_name, projectCode: x.project_code, categoryId: x.category_id,
      category: x.category, revisionNo: x.current_revision_no, revisionLabel: x.revision_label, fileName: x.file_name, fileSize: x.file_size,
      uploadedAt: x.uploaded_at, uploaderId: x.uploader_id, uploaderName: x.uploader_name, documentDate: x.document_date, deletedAt: x.deleted_at,
      canUpload: x.can_upload, canDelete: x.can_delete,
    }));
    return { items, total: r.rows[0]?.total ?? 0, page, pageSize };
  });
}

export type DocRevision = {
  id: string; revisionNo: number; revisionLabel: string; fileName: string; fileSize: number; notes: string | null; createdAt: string;
  uploaderName: string | null; checksum: string | null;
};
export type DocDetail = {
  id: string; title: string; description: string | null; documentDate: string | null; projectId: string; projectName: string; projectCode: string;
  categoryId: string; category: string; currentRevisionNo: number; deletedAt: string | null; deletedByName: string | null; createdAt: string;
  createdByName: string | null; canUpload: boolean; canDelete: boolean; revisions: DocRevision[];
};

export async function getDocument(user: SessionUser, id: string): Promise<DocDetail> {
  if (!isUuid(id)) throw new NotFoundError();
  return withUser(user.id, async (db) => {
    const d = (await db.query(
      `select d.*, p.name as project_name, p.code as project_code, c.name as category, cu.full_name as created_by_name, du.full_name as deleted_by_name,
              app_can_upload(d.project_id) as can_upload, app_can_delete_doc(d.project_id) as can_delete
         from "proj-dashboard-documents" d join "proj-dashboard-projects" p on p.id = d.project_id join "proj-dashboard-document-categories" c on c.id = d.category_id
         left join "proj-dashboard-users" cu on cu.id = d.created_by left join "proj-dashboard-users" du on du.id = d.deleted_by
        where d.id = $1 and p.deleted_at is null`,
      [id],
    )).rows[0];
    if (!d || (d.deleted_at && !d.can_delete)) throw new NotFoundError();
    const revs = await db.query(
      `select r.*, u.full_name from "proj-dashboard-document-revisions" r left join "proj-dashboard-users" u on u.id = r.created_by where r.document_id = $1 order by r.revision_no desc`,
      [id],
    );
    return {
      id: d.id, title: d.title, description: d.description, documentDate: d.document_date, projectId: d.project_id, projectName: d.project_name,
      projectCode: d.project_code, categoryId: d.category_id, category: d.category, currentRevisionNo: d.current_revision_no, deletedAt: d.deleted_at,
      deletedByName: d.deleted_by_name, createdAt: d.created_at, createdByName: d.created_by_name, canUpload: d.can_upload, canDelete: d.can_delete,
      revisions: revs.rows.map((r) => ({
        id: r.id, revisionNo: r.revision_no, revisionLabel: r.revision_label, fileName: r.file_name, fileSize: r.file_size, notes: r.notes,
        createdAt: r.created_at, uploaderName: r.full_name, checksum: r.checksum,
      })),
    };
  });
}

// ------------------------------------------------------------------ upload
export function cleanFileName(name: string) {
  const base = name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim();
  return base.slice(-180) || "document.pdf";
}

export function validatePdf(file: { name: string; data: Buffer }, maxBytes: number) {
  if (!/\.pdf$/i.test(file.name)) throw new ValidationError(`"${file.name}" is not a PDF file (extension must be .pdf).`);
  if (file.data.length === 0) throw new ValidationError(`"${file.name}" is empty.`);
  if (file.data.length > maxBytes) throw new ValidationError(`"${file.name}" exceeds the maximum size of ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  // Server-side content sniffing: a real PDF starts with %PDF- (allowing a few bytes of leading whitespace/BOM).
  if (!file.data.subarray(0, 1024).toString("latin1").includes("%PDF-")) throw new ValidationError(`"${file.name}" is not a valid PDF document.`);
}

async function maxUploadBytes(db: Db) {
  const r = await db.query(`select value from "proj-dashboard-settings" where key = 'max_upload_mb'`);
  return Number(r.rows[0]?.value ?? 50) * 1024 * 1024;
}

function parseMeta(raw: unknown) {
  const r = documentMetaSchema.safeParse(raw);
  if (!r.success) {
    const fe: Record<string, string> = {};
    r.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    throw new ValidationError("Please correct the highlighted fields.", { ...fe });
  }
  return r.data;
}

export async function createDocument(user: SessionUser, input: { projectId: string; meta: unknown; file: { name: string; data: Buffer } }) {
  const meta = parseMeta(input.meta);
  if (!isUuid(input.projectId)) throw new ValidationError("Select a project.", { projectId: "Select a project" });
  const written: string[] = [];
  try {
    return await withUser(user.id, async (db) => {
      validatePdf(input.file, await maxUploadBytes(db));
      const p = (await db.query(`select code, name from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [input.projectId])).rows[0];
      if (!p) throw new NotFoundError("Project not found or not accessible.");
      const cat = (await db.query(`select is_active from "proj-dashboard-document-categories" where id = $1`, [meta.categoryId])).rows[0];
      if (!cat?.is_active) throw new ValidationError("The selected category is not available.", { categoryId: "Select an active category" });

      const docId = crypto.randomUUID();
      const revId = crypto.randomUUID();
      const key = `documents/${input.projectId}/${docId}/${revId}.pdf`;
      const checksum = crypto.createHash("sha256").update(input.file.data).digest("hex");
      const fileName = cleanFileName(input.file.name);

      await db.query(
        `insert into "proj-dashboard-documents" (id, project_id, category_id, title, description, document_date, created_by, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$7)`,
        [docId, input.projectId, meta.categoryId, meta.title, meta.description || null, meta.documentDate || null, user.id],
      );
      await db.query(
        `insert into "proj-dashboard-document-revisions" (id, document_id, revision_no, revision_label, file_name, storage_key, file_size, checksum, created_by)
         values ($1,$2,1,$3,$4,$5,$6,$7,$8)`,
        [revId, docId, meta.revisionLabel || "0", fileName, key, input.file.data.length, checksum, user.id],
      );
      await getStorage().put(key, input.file.data, "application/pdf");
      written.push(key);
      await logActivity(db, user, {
        action: "document.upload", entityType: "document", entityId: docId, projectId: input.projectId, documentId: docId,
        summary: `Uploaded "${meta.title}" (${fileName}) to ${p.code}`, next: { title: meta.title, revision: meta.revisionLabel || "0", size: input.file.data.length },
      });
      await notifyUsers(db, user, await projectAudience(db, input.projectId), {
        type: "document.uploaded", title: "New document uploaded", body: `${meta.title} – ${p.code}`, link: `/documents/${docId}`, projectId: input.projectId, documentId: docId,
      });
      return { id: docId };
    });
  } catch (e) {
    for (const k of written) await getStorage().delete(k).catch(() => undefined);
    throw e;
  }
}

export async function uploadRevision(
  user: SessionUser,
  docId: string,
  input: { revisionLabel: string; notes: string; file: { name: string; data: Buffer } },
) {
  const written: string[] = [];
  try {
    return await withUser(user.id, async (db) => {
      validatePdf(input.file, await maxUploadBytes(db));
      const d = (await db.query(
        `select d.id, d.title, d.project_id, d.deleted_at, p.code,
                (select coalesce(max(revision_no), 0) from "proj-dashboard-document-revisions" where document_id = d.id) as max_rev
           from "proj-dashboard-documents" d join "proj-dashboard-projects" p on p.id = d.project_id where d.id = $1 and p.deleted_at is null`,
        [docId],
      )).rows[0];
      if (!d || d.deleted_at) throw new NotFoundError();
      const no = d.max_rev + 1;
      const revId = crypto.randomUUID();
      const key = `documents/${d.project_id}/${d.id}/${revId}.pdf`;
      const checksum = crypto.createHash("sha256").update(input.file.data).digest("hex");
      const label = input.revisionLabel.trim().slice(0, 30) || String(no - 1);
      const fileName = cleanFileName(input.file.name);
      await db.query(
        `insert into "proj-dashboard-document-revisions" (id, document_id, revision_no, revision_label, file_name, storage_key, file_size, checksum, notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [revId, d.id, no, label, fileName, key, input.file.data.length, checksum, input.notes.trim().slice(0, 1000) || null, user.id],
      );
      const u = await db.query(`update "proj-dashboard-documents" set current_revision_no = $2, updated_by = $3 where id = $1`, [d.id, no, user.id]);
      if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to upload revisions to this document.");
      await getStorage().put(key, input.file.data, "application/pdf");
      written.push(key);
      await logActivity(db, user, {
        action: "document.revision", entityType: "document", entityId: d.id, projectId: d.project_id, documentId: d.id,
        summary: `Uploaded revision ${label} of "${d.title}"`, previous: { revisionNo: no - 1 }, next: { revisionNo: no, label },
      });
      await notifyUsers(db, user, await projectAudience(db, d.project_id), {
        type: "document.revision", title: "New document revision", body: `${d.title} – Rev ${label} (${d.code})`, link: `/documents/${d.id}`, projectId: d.project_id, documentId: d.id,
      });
      return { id: d.id as string, revisionNo: no as number };
    });
  } catch (e) {
    for (const k of written) await getStorage().delete(k).catch(() => undefined);
    throw e;
  }
}

// ------------------------------------------------------------------ edit / delete / restore
const editSchema = documentMetaSchema.extend({ projectId: z.uuid() });

export async function updateDocumentMeta(user: SessionUser, id: string, raw: unknown) {
  const r = editSchema.safeParse(raw);
  if (!r.success) {
    const fe: Record<string, string> = {};
    r.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
    throw new ValidationError("Please correct the highlighted fields.", fe);
  }
  const i = r.data;
  return withUser(user.id, async (db) => {
    const cur = (await db.query(
      `select d.*, (select revision_label from "proj-dashboard-document-revisions" where document_id = d.id and revision_no = d.current_revision_no) as rev_label
         from "proj-dashboard-documents" d where d.id = $1 and d.deleted_at is null`,
      [id],
    )).rows[0];
    if (!cur) throw new NotFoundError();
    const cat = (await db.query(`select is_active from "proj-dashboard-document-categories" where id = $1`, [i.categoryId])).rows[0];
    if (!cat) throw new ValidationError("Select a valid category.", { categoryId: "Select a category" });
    if (!cat.is_active && i.categoryId !== cur.category_id) throw new ValidationError("That category is inactive.", { categoryId: "Select an active category" });
    if (i.projectId !== cur.project_id) {
      const p = await db.query(`select 1 from "proj-dashboard-projects" where id = $1 and deleted_at is null`, [i.projectId]);
      if (!p.rowCount) throw new ValidationError("Target project not found or not accessible.", { projectId: "Select a project" });
    }
    const changes = { title: i.title, description: i.description || null, document_date: i.documentDate || null, category_id: i.categoryId, project_id: i.projectId };
    const d = diff(cur, changes);
    const newLabel = i.revisionLabel || cur.rev_label;
    const labelChanged = newLabel !== cur.rev_label;
    if (!d.changed.length && !labelChanged) return { id, changed: [] as string[] };
    const u = await db.query(
      `update "proj-dashboard-documents" set title = $2, description = $3, document_date = $4, category_id = $5, project_id = $6, updated_by = $7 where id = $1`,
      [id, changes.title, changes.description, changes.document_date, changes.category_id, changes.project_id, user.id],
    );
    if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to edit this document.");
    if (labelChanged) {
      const ur = await db.query(`update "proj-dashboard-document-revisions" set revision_label = $3 where document_id = $1 and revision_no = $2`, [id, cur.current_revision_no, newLabel]);
      if (ur.rowCount === 0) throw new ForbiddenError("You are not allowed to change the revision label.");
      d.previous.revision_label = cur.rev_label;
      d.next.revision_label = newLabel;
      d.changed.push("revision_label");
    }
    await logActivity(db, user, {
      action: "document.update", entityType: "document", entityId: id, projectId: i.projectId, documentId: id,
      summary: `Edited document "${i.title}": ${d.changed.join(", ")}`, previous: d.previous, next: d.next,
    });
    return { id, changed: d.changed };
  });
}

export async function deleteDocument(user: SessionUser, id: string) {
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select id, title, project_id from "proj-dashboard-documents" where id = $1 and deleted_at is null`, [id])).rows[0];
    if (!cur) throw new NotFoundError();
    const u = await db.query(`update "proj-dashboard-documents" set deleted_at = now(), deleted_by = $2, updated_by = $2 where id = $1`, [id, user.id]);
    if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to delete this document.");
    await logActivity(db, user, {
      action: "document.delete", entityType: "document", entityId: id, projectId: cur.project_id, documentId: id,
      summary: `Deleted document "${cur.title}" (kept in trash for the retention period)`,
    });
  });
}

export async function restoreDocument(user: SessionUser, id: string) {
  return withUser(user.id, async (db) => {
    const cur = (await db.query(`select id, title, project_id from "proj-dashboard-documents" where id = $1 and deleted_at is not null`, [id])).rows[0];
    if (!cur) throw new NotFoundError();
    const u = await db.query(`update "proj-dashboard-documents" set deleted_at = null, deleted_by = null, updated_by = $2 where id = $1`, [id, user.id]);
    if (u.rowCount === 0) throw new ForbiddenError("You are not allowed to restore this document.");
    await logActivity(db, user, {
      action: "document.restore", entityType: "document", entityId: id, projectId: cur.project_id, documentId: id, summary: `Restored document "${cur.title}"`,
    });
  });
}

// ------------------------------------------------------------------ permanent deletion (retention policy)
async function purgeTx(db: Db, ids: string[], actor: SessionUser | null) {
  if (!ids.length) return [] as string[];
  const keys = (await db.query<{ storage_key: string }>(`select storage_key from "proj-dashboard-document-revisions" where document_id = any($1::uuid[])`, [ids])).rows.map((r) => r.storage_key);
  const docs = (await db.query(`select id, title, project_id from "proj-dashboard-documents" where id = any($1::uuid[])`, [ids])).rows;
  if (keys.length) await db.query(`insert into "proj-dashboard-storage-deletions" (storage_key) select unnest($1::text[])`, [keys]);
  await db.query(`delete from "proj-dashboard-documents" where id = any($1::uuid[])`, [ids]);
  for (const d of docs)
    await db.query(
      `insert into "proj-dashboard-logs" (user_id, user_name, action, entity_type, entity_id, project_id, summary)
       values ($1,$2,'document.purge','document',$3,$4,$5)`,
      [actor?.id ?? null, actor?.fullName ?? "System (retention policy)", d.id, d.project_id, `Permanently deleted document "${d.title}" and all its revisions`],
    );
  return keys;
}

/** Permanently delete one trashed document + all its revisions' files. */
export async function purgeDocument(user: SessionUser, id: string) {
  assertPerm(user, PERMS.documentDeleteAll, "Only users who can delete any document may permanently delete documents.");
  const row = await withUser(user.id, async (db) => (await db.query(`select deleted_at from "proj-dashboard-documents" where id = $1`, [id])).rows[0]);
  if (!row) throw new NotFoundError();
  if (!row.deleted_at) throw new ConflictError("Only documents in the trash can be permanently deleted.");
  const keys = await sys((db) => purgeTx(db, [id], user));
  await deleteStoredFiles(keys);
}

/** Retention job: purge trashed documents older than `retention_days` and retry failed file deletions. */
export async function purgeExpiredTrash(actor: SessionUser | null) {
  const res = await sys(async (db) => {
    const days = Number((await db.query(`select value from "proj-dashboard-settings" where key = 'retention_days'`)).rows[0]?.value ?? 30);
    const ids = (await db.query<{ id: string }>(
      `select id from "proj-dashboard-documents" where deleted_at is not null and deleted_at < now() - ($1 || ' days')::interval`, [String(days)],
    )).rows.map((r) => r.id);
    const keys = await purgeTx(db, ids, actor);
    return { ids, keys, days };
  });
  await deleteStoredFiles(res.keys);
  const { drainStorageOutbox } = await import("@/server/cleanup");
  const outbox = await drainStorageOutbox();
  return { purgedDocuments: res.ids.length, retentionDays: res.days, outboxRemaining: outbox.remaining };
}

// ------------------------------------------------------------------ file access
export async function getRevisionFile(user: SessionUser, docId: string, revNo?: number) {
  if (!isUuid(docId)) throw new NotFoundError();
  const row = await withUser(user.id, async (db) =>
    (await db.query(
      `select r.storage_key, r.file_name, r.file_size, r.revision_no, r.revision_label, d.title, d.project_id, d.id as doc_id
         from "proj-dashboard-documents" d join "proj-dashboard-projects" p on p.id = d.project_id
         join "proj-dashboard-document-revisions" r on r.document_id = d.id and r.revision_no = coalesce($2::int, d.current_revision_no)
        where d.id = $1 and d.deleted_at is null and p.deleted_at is null`,
      [docId, revNo ?? null],
    )).rows[0],
  );
  if (!row) throw new NotFoundError();
  return {
    key: row.storage_key as string, fileName: row.file_name as string, size: row.file_size as number, revisionNo: row.revision_no as number,
    revisionLabel: row.revision_label as string, title: row.title as string, projectId: row.project_id as string, docId: row.doc_id as string,
  };
}

export async function logDownload(user: SessionUser, f: { docId: string; projectId: string; title: string; revisionLabel: string }) {
  await withUser(user.id, (db) =>
    logActivity(db, user, {
      action: "document.download", entityType: "document", entityId: f.docId, projectId: f.projectId, documentId: f.docId,
      summary: `Downloaded "${f.title}" (Rev ${f.revisionLabel})`,
    }),
  );
}

// ------------------------------------------------------------------ pickers
export async function listUploaders(user: SessionUser) {
  return withUser(user.id, async (db) =>
    (await db.query(`select distinct u.id, u.full_name from "proj-dashboard-document-revisions" r join "proj-dashboard-users" u on u.id = r.created_by order by u.full_name`)).rows.map(
      (x) => ({ id: x.id as string, name: x.full_name as string }),
    ),
  );
}

export async function listProjectOptions(user: SessionUser) {
  return withUser(user.id, async (db) =>
    (await db.query(
      `select p.id, p.code, p.name, app_can_upload(p.id) as can_upload from "proj-dashboard-projects" p
        where p.deleted_at is null and p.is_archived = false order by p.code`,
    )).rows.map((x) => ({ id: x.id as string, code: x.code as string, name: x.name as string, canUpload: x.can_upload as boolean })),
  );
}

export type ProjectDocStats = {
  documents: number; revisions: number; bytes: number; lastUpload: string | null;
  byCategory: { category: string; count: number }[]; monthly: { month: string; count: number }[];
};

export async function getProjectDocStats(user: SessionUser, projectId: string): Promise<ProjectDocStats> {
  return withUser(user.id, async (db) => {
    const t = (await db.query(
      `select count(distinct d.id)::int as docs, count(r.id)::int as revs, coalesce(sum(r.file_size), 0)::bigint as bytes, max(r.created_at) as last_upload
         from "proj-dashboard-documents" d join "proj-dashboard-document-revisions" r on r.document_id = d.id where d.project_id = $1 and d.deleted_at is null`,
      [projectId],
    )).rows[0];
    const cats = (await db.query(
      `select c.name as category, count(*)::int as n from "proj-dashboard-documents" d join "proj-dashboard-document-categories" c on c.id = d.category_id
        where d.project_id = $1 and d.deleted_at is null group by c.name order by n desc, c.name`,
      [projectId],
    )).rows;
    const months = (await db.query(
      `select to_char(date_trunc('month', r.created_at), 'YYYY-MM') as month, count(*)::int as n
         from "proj-dashboard-document-revisions" r join "proj-dashboard-documents" d on d.id = r.document_id
        where d.project_id = $1 and d.deleted_at is null group by 1 order by 1`,
      [projectId],
    )).rows;
    return {
      documents: t.docs, revisions: t.revs, bytes: Number(t.bytes), lastUpload: t.last_upload,
      byCategory: cats.map((c) => ({ category: c.category, count: c.n })), monthly: months.map((m) => ({ month: m.month, count: m.n })),
    };
  });
}
