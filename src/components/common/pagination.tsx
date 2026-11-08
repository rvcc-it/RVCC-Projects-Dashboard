"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/common/native-select";
import { PAGE_SIZES } from "@/lib/constants";
import { useUrlState } from "@/hooks/use-url-state";

export function Pagination({ total, page, pageSize, noun = "records" }: { total: number; page: number; pageSize: number; noun?: string }) {
  const { update, pending } = useUrlState();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row" aria-busy={pending}>
      <p className="text-muted-foreground">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            Showing{" "}
            <b className="font-medium text-foreground">
              {from}–{to}
            </b>{" "}
            of <b className="font-medium text-foreground">{total}</b> {noun}
          </>
        )}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-muted-foreground">
          Rows
          <NativeSelect className="h-7 w-16" value={pageSize} onChange={(e) => update({ size: e.target.value === "10" ? null : e.target.value })} aria-label="Rows per page">
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span className="min-w-20 text-center tabular-nums text-muted-foreground">
            Page {page} / {pages}
          </span>
          <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
