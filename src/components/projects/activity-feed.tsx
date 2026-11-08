import { Activity, FilePlus2, FileX2, FolderPen, History, LogIn, Settings2, UserCog, Users } from "lucide-react";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { ActivityItem } from "@/server/services/activity-log";

function iconFor(action: string) {
  if (action.startsWith("document.delete") || action.startsWith("document.purge")) return FileX2;
  if (action.startsWith("document.")) return FilePlus2;
  if (action.startsWith("project.")) return FolderPen;
  if (action.startsWith("member.")) return Users;
  if (action.startsWith("user.") || action.startsWith("role.")) return UserCog;
  if (action.startsWith("auth.")) return LogIn;
  if (action.startsWith("setting") || action.startsWith("category")) return Settings2;
  return Activity;
}

const pretty = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Audit entries with previous → new values. */
export function ActivityFeed({ items, showProject }: { items: ActivityItem[]; showProject?: boolean }) {
  if (!items.length)
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
        <History className="size-8 opacity-50" /> No activity recorded yet.
      </div>
    );
  return (
    <ol className="relative ml-3 border-l">
      {items.map((a) => {
        const Icon = iconFor(a.action);
        const keys = a.next ? Object.keys(a.next) : [];
        const showDiff = keys.length > 0 && keys.length <= 8 && a.previous !== null;
        return (
          <li key={a.id} className="relative pb-5 pl-6 last:pb-0">
            <span className="absolute top-0.5 -left-3.5 flex size-7 items-center justify-center rounded-full border bg-card text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm">
              <span className="font-medium">{a.userName}</span> <span className="text-muted-foreground">·</span> {a.summary}
            </p>
            <p className="text-xs text-muted-foreground" title={formatDateTime(a.createdAt)}>
              {timeAgo(a.createdAt)} · {formatDateTime(a.createdAt)}
              {showProject && a.projectCode ? ` · ${a.projectCode}` : ""} · <code className="text-[11px]">{a.action}</code>
            </p>
            {showDiff && (
              <dl className="mt-1.5 grid gap-x-3 gap-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-xs sm:grid-cols-[auto_1fr]">
                {keys.map((k) => (
                  <div key={k} className="contents">
                    <dt className="font-medium text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                    <dd>
                      <span className="text-rose-600 line-through decoration-rose-400/60 dark:text-rose-400">{pretty(a.previous?.[k])}</span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="text-emerald-700 dark:text-emerald-400">{pretty(a.next?.[k])}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
