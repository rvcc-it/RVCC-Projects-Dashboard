import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ForbiddenNotice } from "@/components/common/forbidden-notice";
import { AssignmentsPanel } from "@/components/users/assignments-panel";
import { requirePageUser } from "@/server/auth";
import { getUser } from "@/server/services/users";
import { listUserAssignments } from "@/server/services/team";
import { listProjectOptions } from "@/server/services/documents";
import { listActivity } from "@/server/services/activity-log";
import { ActivityFeed } from "@/components/projects/activity-feed";
import { NotFoundError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";
import { formatDateTime, initials } from "@/lib/format";

export const metadata: Metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePageUser();
  if (!hasPerm(me, PERMS.userView) && !hasPerm(me, PERMS.userManage)) return <ForbiddenNotice message="You do not have access to user administration." />;
  const u = await getUser(me, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [assignments, projects, activity] = await Promise.all([listUserAssignments(me, id), listProjectOptions(me), listActivity(me, { userId: id, pageSize: 8 })]);
  const assignedIds = new Set(assignments.map((a) => a.projectId));
  const available = projects.filter((p) => !assignedIds.has(p.id)).map((p) => ({ id: p.id, code: p.code, name: p.name }));

  return (
    <>
      <Link href="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All users</Link>
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-card">
        <Avatar className="size-14"><AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">{initials(u.fullName)}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{u.fullName}</h1>
          <p className="text-sm text-muted-foreground">{u.jobTitle ?? "—"}{u.department ? ` · ${u.department}` : ""}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> {u.email}</span>{u.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /> {u.phone}</span>}</p>
        </div>
        <div className="text-right text-sm">
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium">{u.roleName ?? "No role"}</span>
          <p className="mt-2 text-xs text-muted-foreground">{u.isActive ? "Active" : "Inactive"} · last sign-in {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}</p>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <AssignmentsPanel userId={u.id} userName={u.fullName} assignments={assignments} available={available} canManage={hasPerm(me, PERMS.projectManageTeamAll)} />
        <aside className="rounded-xl border bg-card p-5 shadow-card xl:self-start">
          <h2 className="mb-4 text-sm font-semibold">Recent activity by this user</h2>
          <ActivityFeed items={activity.items} showProject />
        </aside>
      </div>
    </>
  );
}
