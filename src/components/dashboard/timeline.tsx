import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { STATUS_COLOR, type ProjectStatus } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { DashboardData } from "@/server/services/dashboard";

const t = (s: string) => new Date(s + "T00:00:00").getTime();

/** Start vs expected/actual completion for each project, with today marker and progress fill. */
export function TimelineChart({ rows }: { rows: DashboardData["timeline"] }) {
  if (!rows.length) return <EmptyState icon={CalendarRange} title="No scheduled projects" description="Projects need a start and an expected completion date to appear here." />;
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request; "today" is intentionally current
  const today = Date.now();
  const min = Math.min(...rows.map((r) => t(r.start)), today);
  const max = Math.max(...rows.map((r) => t(r.actual ?? r.expected)), today);
  const span = Math.max(max - min, 86400_000);
  const pos = (ms: number) => ((ms - min) / span) * 100;
  const ticks: number[] = [];
  const d = new Date(min);
  d.setDate(1);
  const step = span > 3 * 365 * 86400_000 ? 12 : span > 18 * 30 * 86400_000 ? 6 : 3;
  d.setMonth(Math.floor(d.getMonth() / step) * step);
  while (d.getTime() <= max) {
    if (d.getTime() >= min) ticks.push(d.getTime());
    d.setMonth(d.getMonth() + step);
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 right-0 left-[200px]" aria-hidden="true">
          <div className="absolute inset-y-0 w-px bg-rose-500" style={{ left: `${pos(today)}%` }}>
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded bg-rose-500 px-1 text-[9px] leading-4 text-white">Today</span>
          </div>
        </div>
        <div className="relative ml-[200px] h-6 border-b text-[10px] text-muted-foreground">
          {ticks.map((tk) => (
            <span key={tk} className="absolute -translate-x-1/2" style={{ left: `${pos(tk)}%` }}>
              {new Date(tk).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
            </span>
          ))}
        </div>
        <ul>
          {rows.map((r) => {
            const s = t(r.start);
            const e = t(r.expected);
            const color = STATUS_COLOR[r.status as ProjectStatus] ?? "#94a3b8";
            const w = Math.max(pos(e) - pos(s), 0.8);
            return (
              <li key={r.id} className="group flex h-9 items-center border-b border-dashed last:border-0">
                <Link href={`/projects/${r.id}`} className="w-[200px] shrink-0 truncate pr-3 text-xs hover:text-primary" title={`${r.code} – ${r.name}`}>
                  <span className="font-medium">{r.code}</span> <span className="text-muted-foreground">{r.name}</span>
                </Link>
                <div className="relative h-full flex-1">
                  {ticks.map((tk) => <span key={tk} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${pos(tk)}%` }} />)}
                  <div
                    className="absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-md"
                    style={{ left: `${pos(s)}%`, width: `${w}%`, background: `color-mix(in oklch, ${color} 25%, transparent)`, border: `1px solid ${color}` }}
                    title={`${formatDate(r.start)} → ${formatDate(r.expected)} · ${r.progress}% complete${r.actual ? ` · finished ${formatDate(r.actual)}` : ""}`}
                  >
                    <div className="h-full" style={{ width: `${r.progress}%`, background: color }} />
                  </div>
                  {r.actual && <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground" style={{ left: `${pos(t(r.actual))}%` }} title={`Actual completion ${formatDate(r.actual)}`} />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="h-5" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-primary bg-primary/25" /> Planned duration</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" /> Progress</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rotate-45 bg-foreground" /> Actual completion</span>
        </div>
      </div>
    </div>
  );
}
