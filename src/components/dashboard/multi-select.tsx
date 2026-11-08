"use client";
import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

/** Slicer-style multi-select with in-dropdown search. */
export function MultiSelect({
  label, options, selected, onChange, className,
}: { label: string; options: Option[]; selected: string[]; onChange: (v: string[]) => void; className?: string }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <Popover onOpenChange={(o) => !o && setQ("")}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 justify-between gap-2 font-normal", selected.length > 0 && "border-primary/50 bg-primary/5 text-foreground", className)}
          />
        }
      >
        <span className="truncate">
          {label}
          {selected.length > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">{selected.length}</span>}
        </span>
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="h-8 w-full rounded-md border border-input bg-transparent pr-2 pl-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`Search ${label}`}
          />
        </div>
        <ul className="max-h-60 overflow-y-auto p-1" role="listbox" aria-multiselectable="true" aria-label={label}>
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>}
          {shown.map((o) => {
            const on = selected.includes(o.value);
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <div className="border-t p-1.5">
            <Button variant="ghost" size="xs" className="w-full" onClick={() => onChange([])}>
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
