"use client";
import { Input } from "@/components/ui/input";
import { useUrlState } from "@/hooks/use-url-state";

export function ReportDates() {
  const { update, params } = useUrlState();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <label className="flex items-center gap-1.5">From <Input type="date" className="h-8 w-36" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value || null })} /></label>
      <label className="flex items-center gap-1.5">To <Input type="date" className="h-8 w-36" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value || null })} /></label>
    </div>
  );
}
