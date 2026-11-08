"use client";
import Link from "next/link";
import { useState } from "react";
import { Crown, FolderPlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { StatusBadge } from "@/components/common/status-badge";
import { MEMBER_ROLES, MEMBER_ROLE_LABEL } from "@/lib/constants";
import { addMemberAction, removeMemberAction } from "@/actions/team";

type Assignment = { id: string; projectId: string; code: string; name: string; status: string; memberRole: string; canEdit: boolean; canUpload: boolean; canDeleteDocs: boolean; canManageTeam: boolean; isManager: boolean };
type Option = { id: string; code: string; name: string };

export function AssignmentsPanel({ userId, userName, assignments, available, canManage }: { userId: string; userName: string; assignments: Assignment[]; available: Option[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  const [f, setF] = useState({ projectId: "", memberRole: "engineer", canEdit: false, canUpload: true, canDeleteDocs: false, canManageTeam: false });

  async function add() {
    if (!f.projectId) return toast.error("Select a project.");
    setBusy(true);
    const r = await addMemberAction(f.projectId, { userId, memberRole: f.memberRole, canEdit: f.canEdit, canUpload: f.canUpload, canDeleteDocs: f.canDeleteDocs, canManageTeam: f.canManageTeam });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${userName} assigned`);
    setOpen(false);
    setF({ ...f, projectId: "" });
    router.refresh();
  }

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex items-center justify-between border-b p-4">
        <div><h2 className="text-sm font-semibold">Project assignments <span className="font-normal text-muted-foreground">({assignments.length})</span></h2><p className="text-xs text-muted-foreground">Projects this user belongs to and their project-level permissions.</p></div>
        {canManage && <Button onClick={() => setOpen(true)} disabled={available.length === 0}><FolderPlus /> Assign to project</Button>}
      </div>
      {assignments.length === 0 ? (
        <EmptyState icon={FolderPlus} title="Not assigned to any project" description="Assign this user to a project so they can see its documents." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Role</TableHead><TableHead>Permissions</TableHead>{canManage && <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Link href={`/projects/${a.projectId}`} className="font-medium hover:text-primary hover:underline">{a.name}</Link><div className="font-mono text-xs text-muted-foreground">{a.code}</div></TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="whitespace-nowrap">{a.isManager && <Crown className="mr-1 inline size-3.5 text-amber-500" />}{MEMBER_ROLE_LABEL[a.memberRole] ?? a.memberRole}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[a.canEdit && "edit", a.canUpload && "upload", a.canDeleteDocs && "delete docs", a.canManageTeam && "manage team"].filter(Boolean).join(" · ") || "read only"}</TableCell>
                  {canManage && <TableCell><Button variant="ghost" size="icon-sm" disabled={a.isManager} onClick={() => setRemoving(a)} aria-label={`Remove from ${a.code}`} title={a.isManager ? "Project manager – reassign first" : "Remove assignment"}><Trash2 /></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign {userName} to a project</DialogTitle><DialogDescription>Choose the project, the role and what the user may do there.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Field label="Project" required><NativeSelect value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} aria-label="Project"><option value="">Select a project…</option>{available.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}</NativeSelect></Field>
            <Field label="Role on project"><NativeSelect value={f.memberRole} onChange={(e) => setF({ ...f, memberRole: e.target.value })} aria-label="Role on project">{MEMBER_ROLES.filter((r) => r !== "manager").map((r) => <option key={r} value={r}>{MEMBER_ROLE_LABEL[r]}</option>)}</NativeSelect></Field>
            <div className="grid gap-2 rounded-lg border p-3">
              {([["canEdit", "Edit project"], ["canUpload", "Upload documents"], ["canDeleteDocs", "Delete documents"], ["canManageTeam", "Manage team"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between text-sm">{l}<Switch checked={f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} aria-label={l} /></label>
              ))}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Assign</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove assignment?"
        description={<><b>{userName}</b> will lose access to <b>{removing?.name}</b>.</>}
        confirmLabel="Remove"
        successMessage="Assignment removed"
        onConfirm={() => removeMemberAction(removing!.projectId, removing!.id)}
      />
    </section>
  );
}
