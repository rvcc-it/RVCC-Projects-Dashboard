import { AppShell } from "@/components/layout/app-shell";
import { buildNav } from "@/components/layout/nav";
import { requirePageUser } from "@/server/auth";
import { getBell } from "@/server/services/notifications";

// Every page below this layout requires a valid session; pages then enforce their own permissions.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const bell = await getBell(user);
  return (
    <AppShell
      items={buildNav(user)}
      user={{ fullName: user.fullName, email: user.email, roleName: user.roleName, department: user.department }}
      unread={bell.unread}
      bell={bell.latest.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, isRead: n.isRead, createdAt: n.createdAt }))}
    >
      {children}
    </AppShell>
  );
}
