"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";

export type MenuUser = { fullName: string; email: string; roleName: string; department: string | null };

export function UserMenu({ user }: { user: MenuUser }) {
  const router = useRouter();
  async function logout() {
    const r = await fetch("/api/auth/logout", { method: "POST" });
    if (!r.ok) return toast.error("Could not sign out. Please try again.");
    router.replace("/login");
    router.refresh();
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg p-1 pr-2 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" aria-label="Account menu">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(user.fullName)}</AvatarFallback>
        </Avatar>
        <div className="hidden text-left leading-tight md:block">
          <div className="max-w-40 truncate text-[13px] font-medium">{user.fullName}</div>
          <div className="max-w-40 truncate text-[11px] text-muted-foreground">
            {user.roleName}
            {user.department ? ` · ${user.department}` : ""}
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium text-foreground">{user.fullName}</div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            <div className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{user.roleName}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <UserRound /> My profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings?tab=security" />}>
          <Settings /> Security
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={logout}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
