import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, FolderKanban, PauseCircle, PlayCircle, TrendingDown, TrendingUp } from "lucide-react";
import { filtersToParams, type ProjectFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";
import type { DashboardData } from "@/server/services/dashboard";

function href(f: ProjectFilters, status?: string) {
  const p = filtersToParams({ ...f, statuses: status ? [status] : f.statuses });
  return `/?${p.toString()}`;
}

export function KpiCards({ k, filters }: { k: DashboardData["kpis"]; filters: ProjectFilters }) {
  const docDelta = k.docsThisMonth - k.docsLastMonth;
  const pct = (n: number) => (k.total ? `${Math.round((n / k.total) * 100)}% of portfolio` : "—");
  const cards = [
    { label: "Total Projects", value: k.total, sub: k.newProjectsThisMonth ? `+${k.newProjectsThisMonth} created this month` : "No new projects this month", icon: FolderKanban, tone: "text-primary bg-primary/10", href: href({ ...filters, statuses: [] }) },
    { label: "Active Projects", value: k.active, sub: pct(k.active), icon: PlayCircle, tone: "text-sky-600 bg-sky-500/10 dark:text-sky-300", href: href(filters, "active") },
    { label: "Completed", value: k.completed, sub: pct(k.completed), icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-300", href: href(filters, "completed") },
    { label: "On Hold", value: k.onHold, sub: pct(k.onHold), icon: PauseCircle, tone: "text-amber-600 bg-amber-500/10 dark:text-amber-300", href: href(filters, "on_hold") },
    {
      label: "Documents Uploaded", value: k.documents, icon: FileText, tone: "text-violet-600 bg-violet-500/10 dark:text-violet-300", href: "/documents",
      sub: (
        <span className="inline-flex items-center gap-1">
          {docDelta >= 0 ? <TrendingUp className="size-3 text-emerald-500" /> : <TrendingDown className="size-3 text-rose-500" />}
          {k.docsThisMonth} this month · {docDelta >= 0 ? "+" : ""}{docDelta} vs last
        </span>
      ),
    },
    { label: "Requires Attention", value: k.attention, sub: "On hold, overdue or behind schedule", icon: AlertTriangle, tone: "text-rose-600 bg-rose-500/10 dark:text-rose-300", href: "#attention", alert: k.attention > 0 },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className={cn("group rounded-xl border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md", c.alert && "border-rose-500/30")}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{c.label}</span>
            <span className={cn("flex size-8 items-center justify-center rounded-lg", c.tone)}>
              <c.icon className="size-4" />
            </span>
          </div>
          <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{c.value.toLocaleString()}</div>
          <div className="mt-1 line-clamp-2 min-h-8 text-xs text-muted-foreground">{c.sub}</div>
        </Link>
      ))}
    </div>
  );
}
