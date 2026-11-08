"use client";
import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/form-field";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { createRoleAction, deleteRoleAction, setRolePermissionsAction } from "@/actions/roles";
import { roleSchema } from "@/lib/validators";
import { cn } from "@/lib/utils";
import type { PermissionDef, RoleWithPerms } from "@/server/services/roles";

export function RoleMatrix({ roles, permissions, canManage }: { roles: RoleWithPerms[]; permissions: PermissionDef[]; canManage: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string[]>>(() => Object.fromEntries(roles.map((r) => [r.id, r.permissionCodes])));
  const [saving, startSave] = useTransition();
  const [newRole, setNewRole] = useState(false);
  const [rf, setRf] = useState({ name: "", code: "", description: "" });
  const [rErr, setRErr] = useState<Record<string, string>>({});
  const [delRole, setDelRole] = useState<RoleWithPerms | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, PermissionDef[]>();
    permissions.forEach((p) => m.set(p.group, [...(m.get(p.group) ?? []), p]));
    return [...m];
  }, [permissions]);
  const dirty = (r: RoleWithPerms) => [...(draft[r.id] ?? [])].sort().join() !== [...r.permissionCodes].sort().join();
  const toggle = (r: RoleWithPerms, code: string) => setDraft((d) => ({ ...d, [r.id]: d[r.id].includes(code) ? d[r.id].filter((c) => c !== code) : [...d[r.id], code] }));

  function save(r: RoleWithPerms) {
    startSave(async () => {
      const res = await setRolePermissionsAction(r.id, draft[r.id]);
      if (res.ok) { toast.success(`Permissions for ${r.name} saved (+${res.data.added.length} / −${res.data.removed.length}). Users receive them on their next request.`); router.refresh(); }
      else toast.error(res.error);
    });
  }

  async function createRole() {
    const p = roleSchema.safeParse(rf);
    if (!p.success) { const e: Record<string, string> = {}; p.error.issues.forEach((i) => (e[String(i.path[0])] ??= i.message)); return setRErr(e); }
    const r = await createRoleAction(rf);
    if (!r.ok) { setRErr(r.fieldErrors ?? {}); return toast.error(r.error); }
    toast.success("Role created. Grant it permissions below.");
    setNewRole(false); setRf({ name: "", code: "", description: "" }); setRErr({});
    router.refresh();
  }

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Roles &amp; permissions</h2>
          <p className="text-xs text-muted-foreground">Permissions are stored in the database and enforced by Row Level Security. Project-level flags (edit / upload / delete / team) further limit the “assigned project” permissions.</p>
        </div>
        {canManage && <Button variant="outline" onClick={() => setNewRole(true)}><Plus /> New role</Button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium text-muted-foreground">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-32 px-3 py-3 text-center align-bottom">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[11px] font-normal text-muted-foreground">{r.userCount} user{r.userCount === 1 ? "" : "s"}{r.code === "super_admin" ? " · locked" : r.isSystem ? " · built-in" : " · custom"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, perms]) => (
              <Fragment key={group}>
                <tr className="bg-muted/40"><td colSpan={roles.length + 1} className="px-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group}</td></tr>
                {perms.map((p) => (
                  <tr key={p.code} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2"><div className="font-medium">{p.name}</div><div className="max-w-xs text-xs text-muted-foreground">{p.description}</div></td>
                    {roles.map((r) => (
                      <td key={r.id} className="px-3 py-2 text-center">
                        {r.code === "super_admin" ? <Lock className="mx-auto size-3.5 text-muted-foreground" aria-label="Always granted" /> : (
                          <Checkbox className="mx-auto" checked={draft[r.id]?.includes(p.code) ?? false} disabled={!canManage} onCheckedChange={() => toggle(r, p.code)} aria-label={`${r.name}: ${p.name}`} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {canManage && (
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="sticky left-0 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">Save each role after changing it</td>
                {roles.map((r) => (
                  <td key={r.id} className="px-3 py-3 text-center">
                    {r.code === "super_admin" ? null : (
                      <div className="flex flex-col items-center gap-1.5">
                        <Button size="xs" disabled={!dirty(r) || saving} onClick={() => save(r)} className={cn(!dirty(r) && "opacity-60")}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save</Button>
                        {!r.isSystem && <Button size="xs" variant="ghost" onClick={() => setDelRole(r)}><Trash2 /> Delete</Button>}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Dialog open={newRole} onOpenChange={setNewRole}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New role</DialogTitle><DialogDescription>Create a custom role, then tick the permissions it should have.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Field label="Name" required error={rErr.name}><Input value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value, code: rf.code || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) })} /></Field>
            <Field label="Code" required error={rErr.code} hint="Lower-case identifier, e.g. site_supervisor"><Input value={rf.code} onChange={(e) => setRf({ ...rf, code: e.target.value })} /></Field>
            <Field label="Description" error={rErr.description}><Input value={rf.description} onChange={(e) => setRf({ ...rf, description: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewRole(false)}>Cancel</Button><Button onClick={createRole}>Create role</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!delRole}
        onOpenChange={(o) => !o && setDelRole(null)}
        title="Delete role?"
        description={<>The custom role <b>{delRole?.name}</b> will be removed. Roles that still have users cannot be deleted.</>}
        successMessage="Role deleted"
        onConfirm={() => deleteRoleAction(delRole!.id)}
      />
    </section>
  );
}
