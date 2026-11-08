"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BarChart3, FileText, FolderKanban, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Settings, Users } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";
import { isActive, type NavIcon, type NavItem } from "@/components/layout/nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ICONS: Record<NavIcon, typeof Bell> = { overview: LayoutDashboard, projects: FolderKanban, documents: FileText, reports: BarChart3, users: Users, notifications: Bell, settings: Settings };

export function Sidebar({
  items, collapsed, onToggle, unread, onNavigate, mobile,
}: { items: NavItem[]; collapsed: boolean; onToggle?: () => void; unread: number; onNavigate?: () => void; mobile?: boolean }) {
  const pathname = usePathname();
  const narrow = collapsed && !mobile;
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 shrink-0 items-center border-b border-sidebar-border", narrow ? "justify-center px-2" : "px-5")}>
        <Logo withText={!narrow} textClassName="text-white" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
          const link = (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                narrow && "justify-center px-0",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              {active && <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sidebar-primary" />}
              {(() => { const I = ICONS[it.icon]; return <I className="size-[18px] shrink-0" />; })()}
              {!narrow && <span className="truncate">{it.label}</span>}
              {it.href === "/notifications" && unread > 0 && (
                <span className={cn("ml-auto rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold text-sidebar-primary-foreground", narrow && "absolute top-1 right-2 ml-0")}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
          return narrow ? (
            <Tooltip key={it.href}>
              <TooltipTrigger render={link} />
              <TooltipContent side="right">{it.label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>
      {!mobile && (
        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={onToggle}
            className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground", narrow && "justify-center px-0")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!narrow && "Collapse"}
          </button>
        </div>
      )}
    </div>
  );
}
