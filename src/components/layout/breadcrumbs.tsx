"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const LABELS: Record<string, string> = {
  projects: "Projects", documents: "Project Documents", reports: "Project Reports", users: "Users & Access",
  notifications: "Notifications", settings: "Settings", new: "New", edit: "Edit",
};
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);

export function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => ({ href: "/" + parts.slice(0, i + 1).join("/"), label: isId(p) ? "Details" : (LABELS[p] ?? p) }));
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <Link href="/" className="flex items-center gap-1 hover:text-foreground">
        <Home className="size-4" />
        <span className={crumbs.length ? "sr-only" : "font-medium text-foreground"}>Overview</span>
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          {i === crumbs.length - 1 ? <span className="truncate font-medium text-foreground">{c.label}</span> : <Link href={c.href} className="truncate hover:text-foreground">{c.label}</Link>}
        </span>
      ))}
    </nav>
  );
}
