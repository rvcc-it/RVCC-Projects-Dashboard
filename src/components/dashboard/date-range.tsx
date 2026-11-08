"use client";
import { CalendarRange, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => iso(new Date(Date.now() + n * 86400_000));

/** Date range slicer with quick presets. Empty string = open-ended. */
export function DateRange({ label, from, to, onChange }: { label: string; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const y = new Date().getFullYear();
  const presets: [string, string, string][] = [
    ["Last 30 days", addDays(-30), iso(new Date())],
    ["Last 90 days", addDays(-90), iso(new Date())],
    ["Next 90 days", iso(new Date()), addDays(90)],
    ["This year", `${y}-01-01`, `${y}-12-31`],
    ["Last year", `${y - 1}-01-01`, `${y - 1}-12-31`],
  ];
  const active = !!(from || to);
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className={cn("h-8 justify-between gap-2 font-normal", active && "border-primary/50 bg-primary/5 text-foreground")} />}>
        <span className="flex items-center gap-1.5 truncate">
          <CalendarRange className="size-3.5 opacity-70" />
          {label}
          {active && <span className="text-xs text-muted-foreground">{from ? formatDate(from) : "…"} → {to ? formatDate(to) : "…"}</span>}
        </span>
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">
            From
            <Input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} aria-label={`${label} from`} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            To
            <Input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} aria-label={`${label} to`} />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([n, f, t]) => (
            <Button key={n} variant="secondary" size="xs" onClick={() => onChange(f, t)}>
              {n}
            </Button>
          ))}
        </div>
        {active && (
          <Button variant="ghost" size="xs" onClick={() => onChange("", "")}>
            Clear dates
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
