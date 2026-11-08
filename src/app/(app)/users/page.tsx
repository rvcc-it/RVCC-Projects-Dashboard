import type { Metadata } from "next";
import Link from "next/link";
import { ForbiddenNotice } from "@/components/common/forbidden-notice";
import { PageHeader } from "@/components/common/page-header";
import { RoleMatrix } from "@/components/users/role-matrix";
import { UsersTable } from "@/components/users/users-table";
import { requirePageUser } from "@/server/auth";
import { listUsers } from "@/server/services/users";
import { getRoleMatrix, listRoles } from "@/server/services/roles";
import { PERMS, hasPerm } from "@/lib/permissions";
import { listParams, str, type SP } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Users & Access" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  if (!hasPerm(user, PERMS.userView) && !hasPerm(user, PERMS.userManage)) return <ForbiddenNotice message="You do not have access to user administration." />;
  const sp = await searchParams;
  const tab = str(sp.tab) === "roles" ? "roles" : "users";
  const lp = listParams(sp, "name");

  return (
    <>
      <PageHeader title="Users & Access" description="Manage accounts, roles and what each role is allowed to do." />
      <div className="mb-5 inline-flex rounded-lg border bg-card p-1 shadow-card" role="tablist">
        {[["users", "Users"], ["roles", "Roles & permissions"]].map(([id, label]) => (
          <Link key={id} href={id === "users" ? "/users" : "/users?tab=roles"} role="tab" aria-selected={tab === id} className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition-colors", tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</Link>
        ))}
      </div>
      {tab === "users" ? <UsersTab user={user} sp={sp} lp={lp} /> : <RolesTab user={user} />}
    </>
  );
}

async function UsersTab({ user, sp, lp }: { user: Awaited<ReturnType<typeof requirePageUser>>; sp: SP; lp: ReturnType<typeof listParams> }) {
  const [users, roles] = await Promise.all([
    listUsers(user, { q: str(sp.q), roleId: str(sp.role), status: str(sp.status), sort: lp.sort, dir: lp.dir === "desc" && !sp.dir ? "asc" : lp.dir, page: lp.page, pageSize: lp.pageSize }),
    listRoles(user),
  ]);
  return (
    <UsersTable items={users.items} total={users.total} page={users.page} pageSize={users.pageSize} roles={roles} canManage={hasPerm(user, PERMS.userManage)} currentUserId={user.id} canGrantAdmin={user.roleCode === "super_admin"} />
  );
}

async function RolesTab({ user }: { user: Awaited<ReturnType<typeof requirePageUser>> }) {
  const m = await getRoleMatrix(user);
  return <RoleMatrix roles={m.roles} permissions={m.permissions} canManage={hasPerm(user, PERMS.roleManage)} />;
}
