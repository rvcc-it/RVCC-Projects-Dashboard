"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { CHART_COLORS, STATUS_COLOR, type ProjectStatus } from "@/lib/constants";
import { useUrlState } from "@/hooks/use-url-state";
import { EmptyState } from "@/components/common/empty-state";
import type { MonthPoint, Slice } from "@/server/services/dashboard";

const tip = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)", boxShadow: "0 4px 12px rgb(0 0 0 / 0.1)" },
  itemStyle: { color: "var(--popover-foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 2 },
  cursor: { fill: "var(--muted)", opacity: 0.5 },
};
const axis = { fill: "var(--muted-foreground)", fontSize: 11 };

export function ChartCard({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-4 shadow-card ${className ?? ""}`}>
      <header className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

const NoData = () => <EmptyState icon={BarChart3} title="No data for the current filters" description="Adjust or clear the filters to see results." />;

/** Donut that cross-filters the dashboard when a slice is clicked. */
export function DonutChart({ data, param, colors = "palette" }: { data: Slice[]; param: string; colors?: "palette" | "status" }) {
  const { update, params } = useUrlState();
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <NoData />;
  const color = (k: string, i: number) => (colors === "status" ? statusColor(k) : CHART_COLORS[i % CHART_COLORS.length]);
  const selected = params.getAll(param);
  const click = (key: string) => update({ [param]: selected.includes(key) ? selected.filter((x) => x !== key) : [...selected, key] });
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto]">
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="var(--card)" strokeWidth={2} onClick={(d) => click(String((d as unknown as Slice).key))} cursor="pointer" isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={color(d.key, i)} opacity={selected.length && !selected.includes(d.key) ? 0.35 : 1} />
              ))}
            </Pie>
            <Tooltip {...tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-[11px] text-muted-foreground">projects</span>
        </div>
      </div>
      <ul className="grid gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.key}>
            <button type="button" onClick={() => click(d.key)} className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-muted" title={`Filter by ${d.label}`}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(d.key, i) }} />
              <span className="max-w-36 truncate text-muted-foreground">{d.label}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">{d.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function statusColor(key: string) {
  return STATUS_COLOR[key as ProjectStatus] ?? "#94a3b8";
}

/** Horizontal bar chart that cross-filters when a bar is clicked. */
export function HBarChart({ data, param, valueKey = "key" }: { data: Slice[]; param: string; valueKey?: "key" | "label" }) {
  const { update, params } = useUrlState();
  if (!data.length) return <NoData />;
  const selected = params.getAll(param);
  const click = (d: Slice) => {
    const v = valueKey === "key" ? d.key : d.label;
    if (!v) return;
    update({ [param]: selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v] });
  };
  return (
    <div style={{ height: Math.max(180, data.length * 34 + 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={110} tick={axis} axisLine={false} tickLine={false} interval={0} tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)} />
          <Tooltip {...tip} />
          <Bar dataKey="value" name="Projects" radius={[0, 6, 6, 0]} barSize={18} onClick={(d) => click(d as unknown as Slice)} cursor="pointer" isAnimationActive={false} label={{ position: "right", fill: "var(--muted-foreground)", fontSize: 11 }}>
            {data.map((d, i) => {
              const v = valueKey === "key" ? d.key : d.label;
              return <Cell key={d.key + i} fill={CHART_COLORS[0]} opacity={selected.length && !selected.includes(v) ? 0.35 : 1} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActivityLine({ data }: { data: MonthPoint[] }) {
  if (!data.some((d) => d.a || d.b)) return <NoData />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip {...tip} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="b" name="Activity events" stroke={CHART_COLORS[1]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="a" name="Projects started" stroke={CHART_COLORS[2]} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UploadsBar({ data }: { data: MonthPoint[] }) {
  if (!data.some((d) => d.a)) return <NoData />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
          <Tooltip {...tip} />
          <Bar dataKey="a" name="Uploads (incl. revisions)" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} maxBarSize={32} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
