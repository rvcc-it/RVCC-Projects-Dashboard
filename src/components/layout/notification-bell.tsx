"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markAllReadAction, markReadAction } from "@/actions/notifications";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BellItem = { id: string; title: string; body: string | null; link: string | null; isRead: boolean; createdAt: string };

export function NotificationBell({ unread, items }: { unread: number; items: BellItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} />}>
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <Button
            variant="ghost"
            size="xs"
            disabled={pending || unread === 0}
            onClick={() => start(async () => { await markAllReadAction(); router.refresh(); })}
          >
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">You are all caught up.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={cn("flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/60", !n.isRead && "bg-primary/5")}
                onClick={() =>
                  start(async () => {
                    if (!n.isRead) await markReadAction(n.id);
                    setOpen(false);
                    router.push(n.link ?? "/notifications");
                    router.refresh();
                  })
                }
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <Link href="/notifications" onClick={() => setOpen(false)} className="border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/60">
          View all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}
