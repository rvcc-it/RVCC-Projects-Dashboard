"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EditDocumentDialog, type EditableDoc } from "@/components/documents/edit-dialog";
import { RevisionDialog } from "@/components/documents/revision-dialog";
import type { CategoryOpt, ProjectOpt } from "@/components/documents/upload-dialog";
import { deleteDocumentAction, restoreDocumentAction } from "@/actions/documents";
import { useRunAction } from "@/hooks/use-run-action";

export function DocumentActionsBar({
  doc, revisionNo, currentLabel, projects, categories, maxUploadMb, canUpload, canDelete, canDownload, deleted,
}: {
  doc: EditableDoc; revisionNo: number; currentLabel: string; projects: ProjectOpt[]; categories: CategoryOpt[]; maxUploadMb: number;
  canUpload: boolean; canDelete: boolean; canDownload: boolean; deleted: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useRunAction();
  const [rev, setRev] = useState(false);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  return (
    <>
      {canDownload && !deleted && (
        <a href={`/api/documents/${doc.id}/file?download=1`} className={buttonVariants({ variant: "outline" })}><Download /> Download</a>
      )}
      {canUpload && !deleted && <Button variant="outline" onClick={() => setRev(true)}><Upload /> New revision</Button>}
      {canUpload && !deleted && <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Edit</Button>}
      {canDelete && !deleted && <Button variant="destructive" onClick={() => setDel(true)}><Trash2 /> Delete</Button>}
      {canDelete && deleted && (
        <Button disabled={pending} onClick={() => run(() => restoreDocumentAction(doc.id), { success: "Document restored" })}><RotateCcw /> Restore</Button>
      )}
      <RevisionDialog docId={doc.id} title={doc.title} currentLabel={currentLabel} nextNo={revisionNo + 1} maxUploadMb={maxUploadMb} open={rev} onOpenChange={setRev} />
      <EditDocumentDialog doc={doc} projects={projects} categories={categories} open={edit} onOpenChange={setEdit} />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title="Delete document?"
        description={<>“{doc.title}” moves to the trash and access is revoked immediately. It can be restored until the retention period ends.</>}
        successMessage="Document moved to trash"
        onConfirm={() => deleteDocumentAction(doc.id)}
        onSuccess={() => router.push("/documents")}
      />
    </>
  );
}
