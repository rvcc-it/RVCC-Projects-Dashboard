"use client";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Crown, Loader2, MoreHorizontal, Pencil, Save, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { MEMBER_ROLES, MEMBER_ROLE_LABEL } from "@/lib/constants";
import { memberSchema, type MemberInput } from "@/lib/validators";
import { addMemberAction, removeMemberAction, updateMemberAction } from "@/actions/team";
import type { TeamMember } from "@/server/services/team";

type Assignable = { id: string; name: string; email: string; department: string | null };

const FLAGS: { key: keyof Pick<MemberInput, "canEdit" | "canUpload" | "canDeleteDocs" | "canManageTeam">; label: string; hint: string }[] = [
  { key: "canEdit", label: "Edit project", hint: "Update project details, status and progress" },
  { key: "canUpload", label: "Upload documents", hint: "Upload, revise and edit documents" },
  { key: "canDeleteDocs", label: "Delete documents", hint: "Move documents to the trash" },
  { key: "canManageTeam", label: "Manage team", hint: "Add, edit and remove team members" },
];
const Yes = () => <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Yes</span>;
const No = () => <span className="text-xs text-muted-foreground">–</span>;

function MemberDialog({ projectId, member, assignable, open, onOpenChange }: { projectId: string; member?: TeamMember; assignable: Assignable[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const defaults: MemberInput = {
    userId: member?.userId ?? "", memberRole: (member?.memberRole as MemberInput["memberRole"]) ?? "engineer", canEdit: member?.canEdit ?? false,
    canUpload: member?.canUpload ?? true, canDeleteDocs: member?.canDeleteDocs ?? false, canManageTeam: member?.canManageTeam ?? false,
  };
  const { register, control, handleSubmit, reset, setError, watch, formState: { errors, isSubmitting } } = useForm<MemberInput>({ resolver: zodResolver(memberSchema), defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, member?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const role = watch("memberRole");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? `Edit access – ${member.fullName}` : "Add team member"}</DialogTitle>
          <DialogDescription>Project-specific permissions apply only to this project and only if the user&apos;s system role also allows the action.</DialogDescription>
        </DialogHeader>
        <form
          id="member-form"
          className="grid gap-3"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            const r = member ? await updateMemberAction(projectId, member.id, v) : await addMemberAction(projectId, v);
            if (!r.ok) {
              Object.entries(r.fieldErrors ?? {}).forEach(([k, m]) => setError(k as keyof MemberInput, { message: m }));
              return toast.error(r.error);
            }
            toast.success(member ? "Access updated" : "Member added");
            onOpenChange(false);
            router.refresh();
          })}
        >
          {member ? (
            <Field label="User"><div className="rounded-lg border bg-muted/40 px-3 py-1.5 text-sm">{member.fullName} <span className="text-muted-foreground">· {member.email}</span></div><input type="hidden" {...register("userId")} /></Field>
          ) : (
            <Field label="User" htmlFor="userId" required error={errors.userId?.message}>
              <NativeSelect id="userId" {...register("userId")}>
                <option value="">Select a user…</option>
                {assignable.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Field label="Role on this project" htmlFor="memberRole" error={errors.memberRole?.message}>
            <NativeSelect id="memberRole" {...register("memberRole")} disabled={member?.isManager}>
              {MEMBER_ROLES.filter((r) => r !== "manager" || member?.isManager).map((r) => <option key={r} value={r}>{MEMBER_ROLE_LABEL[r]}</option>)}
            </NativeSelect>
          </Field>
          <div className="grid gap-2 rounded-lg border p-3" role="group" aria-label="Project permissions">
            {FLAGS.map((f) => (
              <Controller
                key={f.key}
                control={control}
                name={f.key}
                render={({ field }) => (
                  <label className="flex items-center justify-between gap-3">
                    <span><span className="block text-sm font-medium">{f.label}</span><span className="block text-xs text-muted-foreground">{f.hint}</span></span>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={member?.isManager && (f.key === "canEdit" || f.key === "canManageTeam")} aria-label={f.label} />
                  </label>
                )}
              />
            ))}
            {role === "viewer" && <p className="text-xs text-muted-foreground">Viewers can read the project and its documents; turn on flags above only if they need more.</p>}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="member-form" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" /> : member ? <Save /> : <UserPlus />} {member ? "Save" : "Add member"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPanel({ projectId, members, assignable, canManage }: { projectId: string; members: TeamMember[]; assignable: Assignable[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-sm font-semibold">Project team <span className="font-normal text-muted-foreground">({members.length})</span></h2>
          <p className="text-xs text-muted-foreground">Who can see and work on this project, and what they may do.</p>
        </div>
        {canManage && <Button onClick={() => setAdding(true)}><UserPlus /> Add member</Button>}
      </div>
      {members.length === 0 ? (
        <EmptyState icon={Users} title="No team members yet" description="Add engineers and staff so they can access this project." action={canManage && <Button onClick={() => setAdding(true)}><UserPlus /> Add member</Button>} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead><TableHead>Project role</TableHead><TableHead>System role</TableHead>
                <TableHead className="text-center">Edit</TableHead><TableHead className="text-center">Upload</TableHead><TableHead className="text-center">Delete docs</TableHead><TableHead className="text-center">Manage team</TableHead>
                {canManage && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-medium">{m.fullName} {m.isManager && <Crown className="size-3.5 text-amber-500" aria-label="Project manager" />} {!m.isActive && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">inactive</span>}</div>
                    <div className="text-xs text-muted-foreground">{m.email}{m.department ? ` · ${m.department}` : ""}</div>
                  </TableCell>
                  <TableCell>{MEMBER_ROLE_LABEL[m.memberRole] ?? m.memberRole}</TableCell>
                  <TableCell className="text-muted-foreground">{m.systemRole ?? "—"}</TableCell>
                  <TableCell className="text-center">{m.canEdit ? <Yes /> : <No />}</TableCell>
                  <TableCell className="text-center">{m.canUpload ? <Yes /> : <No />}</TableCell>
                  <TableCell className="text-center">{m.canDeleteDocs ? <Yes /> : <No />}</TableCell>
                  <TableCell className="text-center">{m.canManageTeam ? <Yes /> : <No />}</TableCell>
                  {canManage && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.fullName}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setEditing(m)}><Pencil /> Edit access</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(m)} disabled={m.isManager}><Trash2 /> Remove</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <MemberDialog projectId={projectId} assignable={assignable} open={adding} onOpenChange={setAdding} />
      {editing && <MemberDialog projectId={projectId} member={editing} assignable={assignable} open onOpenChange={(o) => !o && setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove team member?"
        description={<><b>{removing?.fullName}</b> will lose access to this project and its documents immediately (unless they have company-wide access).</>}
        confirmLabel="Remove"
        successMessage="Member removed"
        onConfirm={() => removeMemberAction(projectId, removing!.id)}
      />
    </section>
  );
}
