"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArchiveRestore, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { archiveProjectAction, deleteProjectAction } from "@/actions/projects";

export function ProjectRowActions({ id, code, name, isArchived, canEdit, canDelete, docCount, afterDelete, hideView }: { id: string; code: string; name: string; isArchived: boolean; canEdit: boolean; canDelete: boolean; docCount: number; afterDelete?: string; hideView?: boolean }) {
  const router = useRouter();
  const [del, setDel] = useState(false);
  const [arch, setArch] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${code}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {!hideView && (
            <DropdownMenuItem render={<Link href={`/projects/${id}`} />}>
              <Eye /> View details
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem render={<Link href={`/projects/${id}/edit`} />}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onClick={() => setArch(true)}>
              {isArchived ? <ArchiveRestore /> : <Archive />} {isArchived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDel(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={arch}
        onOpenChange={setArch}
        title={isArchived ? "Restore this project?" : "Archive this project?"}
        description={isArchived ? `${code} will appear in dashboards and lists again.` : `${code} will be hidden from dashboards and default lists. Its documents and history are kept and you can restore it any time.`}
        confirmLabel={isArchived ? "Unarchive" : "Archive"}
        destructive={false}
        successMessage={isArchived ? "Project restored" : "Project archived"}
        onConfirm={() => archiveProjectAction(id, !isArchived)}
      />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title="Delete project?"
        description={
          docCount > 0 ? (
            <>
              <b>{name}</b> still has {docCount} document(s), so it cannot be deleted. Archive it instead to keep every record.
            </>
          ) : (
            <>
              <b>{name}</b> will be removed from all lists (soft delete, restorable by an administrator). This is recorded in the audit log.
            </>
          )
        }
        requireText={docCount > 0 ? undefined : code}
        confirmLabel="Delete project"
        successMessage="Project deleted"
        onConfirm={() => deleteProjectAction(id)}
        onSuccess={() => afterDelete && router.push(afterDelete)}
      />
    </>
  );
}
