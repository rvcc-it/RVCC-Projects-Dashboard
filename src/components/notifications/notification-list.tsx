"use client";
import Link from "next/link";
import { Bell, CheckCheck, Eye, EyeOff, FilePlus2, FolderPen, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { NativeSelect } from "@/components/common/native-select";
import { Pagination } from "@/components/common/pagination";
import { clearReadAction, deleteNotificationAction, markAllReadAction, markReadAction } from "@/actions/notifications";
import { useRunAction } from "@/hooks/use-run-action";
import { useUrlState } from "@/hooks/use-url-state";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/server/services/notifications";

const icon = (t: string) => (t.startsWith("document") ? FilePlus2 : t.includes("assigned") || t.includes("unassigned") ? UserPlus : t.startsWith("project") ? FolderPen : Bell);

export function NotificationList({ items, total, page, pageSize, unreadCount }: { items: NotificationItem[]; total: number; page: number; pageSize: number; unreadCount: number }) {
  const { run, pending } = useRunAction();
  const { update, params } = useUrlState();
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
        <NativeSelect className="h-8 w-40" value={params.get("filter") ?? "all"} onChange={(e) => update({ filter: e.target.value === "all" ? null : e.target.value })} aria-label="Filter notifications">
          <option value="all">All notifications</option>
          <option value="unread">Unread only</option>
        </NativeSelect>
        <NativeSelect className="h-8 w-48" value={params.get("type") ?? ""} onChange={(e) => update({ type: e.target.value || null })} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="project.created">New projects</option>
          <option value="project.assigned">Assignments</option>
          <option value="project.updated">Project updates</option>
          <option value="project.status_changed">Status changes</option>
          <option value="document.uploaded">New documents</option>
          <option value="document.revision">New revisions</option>
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={pending || unreadCount === 0} onClick={() => run(() => markAllReadAction(), { success: "All notifications marked as read" })}><CheckCheck /> Mark all read ({unreadCount})</Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => clearReadAction(), { success: "Read notifications cleared" })}><Trash2 /> Clear read</Button>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You will be notified about new projects, assignments, uploads, revisions and status changes." />
      ) : (
        <ul className="divide-y">
          {items.map((n) => {
            const I = icon(n.type);
            return (
              <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3.5", !n.isRead && "bg-primary/5")}>
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", n.isRead ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}><I className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}{!n.isRead && <span className="ml-2 inline-block size-2 rounded-full bg-primary align-middle" aria-label="unread" />}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground" title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)} · {formatDateTime(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {n.link && <Link href={n.link} onClick={() => !n.isRead && markReadAction(n.id)} className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10">Open</Link>}
                  <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => run(() => markReadAction(n.id, !n.isRead))} aria-label={n.isRead ? "Mark as unread" : "Mark as read"} title={n.isRead ? "Mark as unread" : "Mark as read"}>{n.isRead ? <EyeOff /> : <Eye />}</Button>
                  <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => run(() => deleteNotificationAction(n.id), { success: "Notification deleted" })} aria-label="Delete notification" title="Delete"><Trash2 /></Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination total={total} page={page} pageSize={pageSize} noun="notifications" />
    </section>
  );
}
