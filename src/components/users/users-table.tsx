"use client";
import Link from "next/link";
import { useState } from "react";
import { FolderKanban, KeyRound, MoreHorizontal, Pencil, Trash2, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { NativeSelect } from "@/components/common/native-select";
import { Pagination } from "@/components/common/pagination";
import { SearchInput } from "@/components/common/search-input";
import { SortHead } from "@/components/common/sort-head";
import { SecretDialog, UserDialog, type RoleOpt } from "@/components/users/user-dialog";
import { deleteUserAction, resetUserPasswordAction, updateUserAction } from "@/actions/users";
import { useUrlState } from "@/hooks/use-url-state";
import { formatDateTime, initials } from "@/lib/format";
import type { UserListItem } from "@/server/services/users";

export function UsersTable({ items, total, page, pageSize, roles, canManage, currentUserId, canGrantAdmin }: { items: UserListItem[]; total: number; page: number; pageSize: number; roles: RoleOpt[]; canManage: boolean; currentUserId: string; canGrantAdmin: boolean }) {
  const { update, params } = useUrlState();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [deleting, setDeleting] = useState<UserListItem | null>(null);
  const [toggling, setToggling] = useState<UserListItem | null>(null);
  const [link, setLink] = useState<{ name: string; url: string; sent: boolean } | null>(null);

  async function reset(u: UserListItem) {
    const r = await resetUserPasswordAction(u.id);
    if (!r.ok) return toast.error(r.error);
    setLink({ name: u.fullName, url: r.data.url, sent: r.data.emailSent });
  }

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
        <SearchInput placeholder="Search name, e-mail, department…" className="w-full sm:w-72" />
        <NativeSelect className="h-8 w-44" value={params.get("role") ?? ""} onChange={(e) => update({ role: e.target.value || null })} aria-label="Filter by role">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </NativeSelect>
        <NativeSelect className="h-8 w-36" value={params.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null })} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NativeSelect>
        {canManage && <Button className="ml-auto" onClick={() => setCreating(true)}><UserPlus /> Add user</Button>}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Users} title="No users match" description="Try a different search or filter." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead id="name" defaultSort="name">User</SortHead>
                <SortHead id="role" defaultSort="name">Role</SortHead>
                <SortHead id="status" defaultSort="name">Status</SortHead>
                <SortHead id="login" defaultSort="name">Last sign-in</SortHead>
                <th className="px-3 text-left text-xs font-medium text-muted-foreground">Projects</th>
                <th className="w-10" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(u.fullName)}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <Link href={`/users/${u.id}`} className="font-medium hover:text-primary hover:underline">{u.fullName}</Link>
                        {u.id === currentUserId && <span className="ml-1.5 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">you</span>}
                        {u.isDemo && <span className="ml-1.5 rounded bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">demo</span>}
                        <div className="truncate text-xs text-muted-foreground">{u.email}{u.department ? ` · ${u.department}` : ""}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><span className="rounded-md bg-secondary px-2 py-0.5 text-xs whitespace-nowrap">{u.roleName ?? "No role"}</span></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-slate-500/10 text-slate-600 dark:text-slate-300"}`}>
                      <span className="size-1.5 rounded-full bg-current" /> {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</TableCell>
                  <TableCell className="tabular-nums">{u.projectCount}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.fullName}`} />}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem render={<Link href={`/users/${u.id}`} />}><FolderKanban /> Project assignments</DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuItem onClick={() => setEditing(u)}><Pencil /> Edit profile &amp; role</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => reset(u)} disabled={!u.isActive}><KeyRound /> Send password reset</DropdownMenuItem>
                            {u.id !== currentUserId && (
                              <DropdownMenuItem onClick={() => setToggling(u)}>{u.isActive ? <UserX /> : <UserCheck />} {u.isActive ? "Deactivate" : "Activate"}</DropdownMenuItem>
                            )}
                            {u.id !== currentUserId && (<><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setDeleting(u)}><Trash2 /> Delete user</DropdownMenuItem></>)}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination total={total} page={page} pageSize={pageSize} noun="users" />

      <UserDialog roles={roles} open={creating} onOpenChange={setCreating} canGrantAdmin={canGrantAdmin} />
      {editing && <UserDialog user={editing} roles={roles} open onOpenChange={(o) => !o && setEditing(null)} canGrantAdmin={canGrantAdmin} isSelf={editing.id === currentUserId} />}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.isActive ? "Deactivate account?" : "Activate account?"}
        description={toggling?.isActive ? <><b>{toggling?.fullName}</b> will be signed out and unable to sign in. Their documents, history and project records are kept.</> : <><b>{toggling?.fullName}</b> will be able to sign in again.</>}
        confirmLabel={toggling?.isActive ? "Deactivate" : "Activate"}
        destructive={!!toggling?.isActive}
        successMessage={toggling?.isActive ? "Account deactivated" : "Account activated"}
        onConfirm={() => updateUserAction(toggling!.id, { email: toggling!.email, username: toggling!.username ?? "", fullName: toggling!.fullName, department: toggling!.department ?? "", jobTitle: toggling!.jobTitle ?? "", phone: toggling!.phone ?? "", roleId: toggling!.roleId, isActive: !toggling!.isActive })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete user permanently?"
        description={<><b>{deleting?.fullName}</b> ({deleting?.email}) will be removed. Records they created are kept but lose their author link; the audit log keeps their name. Consider deactivating instead.</>}
        requireText={deleting?.email}
        confirmLabel="Delete user"
        successMessage="User deleted"
        onConfirm={() => deleteUserAction(deleting!.id)}
      />
      <SecretDialog
        open={!!link}
        onOpenChange={(o) => !o && setLink(null)}
        title="Password reset link"
        description={`One-time link for ${link?.name} (valid 1 hour). ${link?.sent ? "It was also e-mailed to the user." : "E-mail is not configured, so share the link securely."}`}
        label="Reset link"
        value={link?.url ?? ""}
      />
    </section>
  );
}
