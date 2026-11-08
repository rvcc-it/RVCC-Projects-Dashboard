import { PERMS, hasPerm, type PermissionHolder } from "@/lib/permissions";

export type NavIcon = "overview" | "projects" | "documents" | "reports" | "users" | "notifications" | "settings";
export type NavItem = { href: string; label: string; icon: NavIcon; show: boolean };

export function buildNav(user: PermissionHolder): NavItem[] {
  const all: NavItem[] = [
    { href: "/", label: "Overview", icon: "overview", show: true },
    { href: "/projects", label: "Projects", icon: "projects", show: true },
    { href: "/documents", label: "Project Documents", icon: "documents", show: true },
    { href: "/reports", label: "Project Reports", icon: "reports", show: hasPerm(user, PERMS.reportView) },
    { href: "/users", label: "Users & Access", icon: "users", show: hasPerm(user, PERMS.userView) || hasPerm(user, PERMS.userManage) },
    { href: "/notifications", label: "Notifications", icon: "notifications", show: true },
    { href: "/settings", label: "Settings", icon: "settings", show: true },
  ];
  return all.filter((n) => n.show);
}

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
