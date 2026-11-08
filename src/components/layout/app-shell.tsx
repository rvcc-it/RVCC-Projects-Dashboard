"use client";
import { useState } from "react";
import { useStoredValue } from "@/hooks/use-stored-value";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationBell, type BellItem } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu, type MenuUser } from "@/components/layout/user-menu";
import type { NavItem } from "@/components/layout/nav";

export function AppShell({ children, items, user, unread, bell }: { children: React.ReactNode; items: NavItem[]; user: MenuUser; unread: number; bell: BellItem[] }) {
  const [stored, setStored] = useStoredValue("sidebar-collapsed");
  const collapsed = stored === "1";
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () => setStored(collapsed ? "0" : "1");

  return (
    <div className="min-h-screen">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block ${collapsed ? "w-[72px]" : "w-64"}`}>
        <Sidebar items={items} collapsed={collapsed} onToggle={toggle} unread={unread} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <Sidebar items={items} collapsed={false} unread={unread} mobile onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? "lg:pl-[72px]" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="size-5" />
            </Button>
            <div className="hidden min-w-0 flex-1 lg:block">
              <Breadcrumbs />
            </div>
            <div className="flex flex-1 justify-end lg:flex-none lg:basis-96">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell unread={unread} items={bell} />
              <ThemeToggle />
              <UserMenu user={user} />
            </div>
          </div>
          <div className="border-t px-4 py-2 lg:hidden">
            <Breadcrumbs />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
