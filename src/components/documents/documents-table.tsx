"use client";
import Link from "next/link";
import { useState } from "react";
import { Download, Eye, FileSearch, FileText, History, MoreHorizontal, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRunAction } from "@/hooks/use-run-action";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { SortHead } from "@/components/common/sort-head";
import { PdfViewer } from "@/components/documents/pdf-viewer-loader";
import { RevisionDialog } from "@/components/documents/revision-dialog";
import { EditDocumentDialog } from "@/components/documents/edit-dialog";
import type { CategoryOpt, ProjectOpt } from "@/components/documents/upload-dialog";
import { deleteDocumentAction, purgeDocumentAction, restoreDocumentAction } from "@/actions/documents";
import { formatBytes, formatDate } from "@/lib/format";
import type { DocListItem } from "@/server/services/documents";

function RestoreButton({ id }: { id: string }) {
  const { run, pending } = useRunAction();
  return (
    <Button variant="outline" size="xs" disabled={pending} onClick={() => run(() => restoreDocumentAction(id), { success: "Document restored" })}>
      <RotateCcw /> Restore
    </Button>
  );
}

export function DocumentsTable({
  items, total, page, pageSize, projects, categories, maxUploadMb, canDownload, canPurge, trash = false, hideProject = false,
}: {
  items: DocListItem[]; total: number; page: number; pageSize: number; projects: ProjectOpt[]; categories: CategoryOpt[]; maxUploadMb: number;
  canDownload: boolean; canPurge: boolean; trash?: boolean; hideProject?: boolean;
}) {
  const [preview, setPreview] = useState<DocListItem | null>(null);
  const [edit, setEdit] = useState<DocListItem | null>(null);
  const [rev, setRev] = useState<DocListItem | null>(null);
  const [del, setDel] = useState<DocListItem | null>(null);
  const [purge, setPurge] = useState<DocListItem | null>(null);

  return (
    <>
      {items.length === 0 ? (
        <EmptyState icon={trash ? Trash2 : FileSearch} title={trash ? "Trash is empty" : "No documents found"} description={trash ? "Deleted documents stay here until the retention period ends." : "Adjust the filters or upload a new PDF to get started."} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead id="title" defaultSort="date">Document name</SortHead>
                {!hideProject && <SortHead id="project" defaultSort="date">Project</SortHead>}
                <SortHead id="category" defaultSort="date">Category</SortHead>
                <SortHead id="revision" defaultSort="date">Revision</SortHead>
                <SortHead id="uploader" defaultSort="date">Uploaded by</SortHead>
                <SortHead id="date" defaultSort="date">{trash ? "Last uploaded" : "Upload date"}</SortHead>
                <SortHead id="size" defaultSort="date">File size</SortHead>
                <th className="w-28" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="min-w-64">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-300"><FileText className="size-4" /></span>
                      <div className="min-w-0">
                        {trash ? <span className="font-medium">{d.title}</span> : <Link href={`/documents/${d.id}`} className="font-medium hover:text-primary hover:underline">{d.title}</Link>}
                        <div className="truncate text-xs text-muted-foreground">{d.fileName}</div>
                      </div>
                    </div>
                  </TableCell>
                  {!hideProject && (
                    <TableCell className="min-w-44">
                      <Link href={`/projects/${d.projectId}`} className="hover:text-primary hover:underline">{d.projectName}</Link>
                      <div className="font-mono text-xs text-muted-foreground">{d.projectCode}</div>
                    </TableCell>
                  )}
                  <TableCell><span className="rounded-md bg-secondary px-2 py-0.5 text-xs whitespace-nowrap">{d.category}</span></TableCell>
                  <TableCell className="whitespace-nowrap">Rev {d.revisionLabel} <span className="text-xs text-muted-foreground">(#{d.revisionNo})</span></TableCell>
                  <TableCell className="whitespace-nowrap">{d.uploaderName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(d.uploadedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">{formatBytes(d.fileSize)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      {trash ? (
                        <RestoreButton id={d.id} />
                      ) : (
                        <>
                          <Button variant="ghost" size="icon-sm" onClick={() => setPreview(d)} aria-label={`Preview ${d.title}`} title="Preview"><Eye /></Button>
                          {canDownload && <a href={`/api/documents/${d.id}/file?download=1`} aria-label={`Download ${d.title}`} title="Download" className={buttonVariants({ variant: "ghost", size: "icon-sm" })}><Download /></a>}
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${d.title}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {!trash && <DropdownMenuItem render={<Link href={`/documents/${d.id}`} />}><History /> Details &amp; revisions</DropdownMenuItem>}
                          {!trash && d.canUpload && <DropdownMenuItem onClick={() => setRev(d)}><Upload /> Upload new revision</DropdownMenuItem>}
                          {!trash && d.canUpload && <DropdownMenuItem onClick={() => setEdit(d)}><Pencil /> Edit details</DropdownMenuItem>}
                          {!trash && d.canDelete && (<><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDel(d)}><Trash2 /> Delete</DropdownMenuItem></>)}
                          {trash && canPurge && <DropdownMenuItem variant="destructive" onClick={() => setPurge(d)}><Trash2 /> Delete permanently</DropdownMenuItem>}
                          {trash && !canPurge && <DropdownMenuItem disabled>Only administrators can purge</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination total={total} page={page} pageSize={pageSize} noun="documents" />

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="h-[88vh] max-h-[88vh] grid-rows-[auto_1fr] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="pr-8 truncate">{preview?.title}</DialogTitle>
            <DialogDescription>{preview?.projectCode} · {preview?.category} · Rev {preview?.revisionLabel}</DialogDescription>
          </DialogHeader>
          {preview && <PdfViewer docId={preview.id} canDownload={canDownload} largeHref={`/documents/${preview.id}`} height="100%" />}
        </DialogContent>
      </Dialog>

      {edit && <EditDocumentDialog doc={{ id: edit.id, title: edit.title, description: null, categoryId: edit.categoryId, projectId: edit.projectId, revisionLabel: edit.revisionLabel, documentDate: edit.documentDate }} projects={projects} categories={categories} open onOpenChange={(o) => !o && setEdit(null)} />}
      {rev && <RevisionDialog docId={rev.id} title={rev.title} currentLabel={rev.revisionLabel} nextNo={rev.revisionNo + 1} maxUploadMb={maxUploadMb} open onOpenChange={(o) => !o && setRev(null)} />}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete document?"
        description={<>“{del?.title}” will be removed from lists and access is revoked immediately. It stays in the trash for the retention period and can be restored.</>}
        successMessage="Document moved to trash"
        onConfirm={() => deleteDocumentAction(del!.id)}
      />
      <ConfirmDialog
        open={!!purge}
        onOpenChange={(o) => !o && setPurge(null)}
        title="Permanently delete?"
        description={<>“{purge?.title}” and <b>all of its revisions</b> will be erased from the database and file storage. This cannot be undone.</>}
        confirmLabel="Delete permanently"
        successMessage="Document permanently deleted"
        onConfirm={() => purgeDocumentAction(purge!.id)}
      />
    </>
  );
}
