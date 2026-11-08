import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Eye, FolderKanban } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { DocumentActionsBar } from "@/components/documents/document-actions-bar";
import { PdfViewer } from "@/components/documents/pdf-viewer-loader";
import { ActivityFeed } from "@/components/projects/activity-feed";
import { requirePageUser } from "@/server/auth";
import { getDocument, listProjectOptions } from "@/server/services/documents";
import { listCategories } from "@/server/services/categories";
import { listActivity } from "@/server/services/activity-log";
import { getSettings } from "@/server/services/settings";
import { NotFoundError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SP } from "@/lib/search-params";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser();
  const doc = await getDocument(user, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [projects, categories, settings, activity] = await Promise.all([
    listProjectOptions(user), listCategories(user), getSettings(user), listActivity(user, { documentId: id, pageSize: 8 }),
  ]);
  const revParam = Number(Array.isArray(sp.rev) ? sp.rev[0] : sp.rev);
  const viewing = doc.revisions.find((r) => r.revisionNo === revParam) ?? doc.revisions[0];
  const current = doc.revisions[0];
  const canDownload = hasPerm(user, PERMS.documentDownload);

  return (
    <>
      <PageHeader
        title={doc.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/projects/${doc.projectId}`} className="inline-flex items-center gap-1 hover:text-primary hover:underline"><FolderKanban className="size-3.5" /> {doc.projectCode} – {doc.projectName}</Link>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs">{doc.category}</span>
            {doc.deletedAt && <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive">In trash since {formatDate(doc.deletedAt)}</span>}
          </span>
        }
        actions={
          <DocumentActionsBar
            doc={{ id: doc.id, title: doc.title, description: doc.description, categoryId: doc.categoryId, projectId: doc.projectId, revisionLabel: current.revisionLabel, documentDate: doc.documentDate }}
            revisionNo={doc.currentRevisionNo} currentLabel={current.revisionLabel} projects={projects} categories={categories.filter((c) => c.isActive)}
            maxUploadMb={settings.maxUploadMb} canUpload={doc.canUpload} canDelete={doc.canDelete} canDownload={canDownload} deleted={!!doc.deletedAt}
          />
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div>
          {doc.deletedAt ? (
            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-card">This document is in the trash. Restore it to preview or download.</div>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                Viewing revision <b className="text-foreground">{viewing.revisionLabel}</b> (#{viewing.revisionNo}){viewing.revisionNo !== doc.currentRevisionNo && " – superseded"} · {viewing.fileName}
              </p>
              <PdfViewer key={viewing.revisionNo} docId={doc.id} revision={viewing.revisionNo} canDownload={canDownload} height="min(78vh, 900px)" />
            </>
          )}
        </div>
        <aside className="grid content-start gap-5">
          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Project</dt><dd>{doc.projectName}</dd>
              <dt className="text-muted-foreground">Category</dt><dd>{doc.category}</dd>
              <dt className="text-muted-foreground">Revision</dt><dd>Rev {current.revisionLabel} (#{doc.currentRevisionNo})</dd>
              <dt className="text-muted-foreground">Document date</dt><dd>{formatDate(doc.documentDate)}</dd>
              <dt className="text-muted-foreground">Uploaded by</dt><dd>{doc.createdByName ?? "—"}</dd>
              <dt className="text-muted-foreground">First uploaded</dt><dd>{formatDateTime(doc.createdAt)}</dd>
              <dt className="text-muted-foreground">File size</dt><dd>{formatBytes(current.fileSize)}</dd>
              {doc.description && (<><dt className="text-muted-foreground">Description</dt><dd className="whitespace-pre-wrap">{doc.description}</dd></>)}
            </dl>
          </section>
          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Revision history <span className="font-normal text-muted-foreground">({doc.revisions.length})</span></h2>
            <ul className="grid gap-2">
              {doc.revisions.map((r) => (
                <li key={r.id} className={cn("rounded-lg border p-3", r.revisionNo === viewing.revisionNo && "border-primary/50 bg-primary/5")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Rev {r.revisionLabel} <span className="text-xs font-normal text-muted-foreground">#{r.revisionNo}{r.revisionNo === doc.currentRevisionNo ? " · current" : ""}</span></div>
                    {!doc.deletedAt && (
                      <div className="flex gap-1">
                        <Link href={`/documents/${doc.id}?rev=${r.revisionNo}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Preview revision ${r.revisionLabel}`} title="Preview"><Eye /></Link>
                        {canDownload && <a href={`/api/documents/${doc.id}/file?download=1&rev=${r.revisionNo}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Download revision ${r.revisionLabel}`} title="Download"><Download /></a>}
                      </div>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{r.fileName} · {formatBytes(r.fileSize)}</div>
                  <div className="text-xs text-muted-foreground">{r.uploaderName ?? "—"} · {formatDateTime(r.createdAt)}</div>
                  {r.notes && <p className="mt-1.5 text-xs">{r.notes}</p>}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Audit trail</h2>
            <ActivityFeed items={activity.items} />
          </section>
        </aside>
      </div>
    </>
  );
}
