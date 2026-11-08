"use client";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { cn } from "@/lib/utils";

export function SortHead({ id, children, className, defaultSort = "updated" }: { id: string; children: React.ReactNode; className?: string; defaultSort?: string }) {
  const { update, params } = useUrlState();
  const cur = params.get("sort") ?? defaultSort;
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const active = cur === id;
  return (
    <TableHead className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={cn("-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium hover:text-foreground", active ? "text-foreground" : "text-muted-foreground")}
        onClick={() => update({ sort: id, dir: active && dir === "desc" ? "asc" : "desc" })}
      >
        {children}
        {active ? dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
      </button>
    </TableHead>
  );
}
