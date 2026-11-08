import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { NotificationList } from "@/components/notifications/notification-list";
import { requirePageUser } from "@/server/auth";
import { getBell, listNotifications } from "@/server/services/notifications";
import { listParams, str, type SP } from "@/lib/search-params";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const lp = listParams(sp, "date");
  const [list, bell] = await Promise.all([
    listNotifications(user, { unreadOnly: str(sp.filter) === "unread", type: str(sp.type), page: lp.page, pageSize: lp.pageSize }),
    getBell(user),
  ]);
  return (
    <>
      <PageHeader title="Notifications" description="Updates about projects you work on." />
      <NotificationList items={list.items} total={list.total} page={list.page} pageSize={list.pageSize} unreadCount={bell.unread} />
    </>
  );
}
