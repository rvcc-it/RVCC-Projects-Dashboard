"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUrlState } from "@/hooks/use-url-state";

/** Debounced search box bound to the ?q= URL parameter. */
export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { update, params } = useUrlState();
  const urlValue = params.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  const [seenUrl, setSeenUrl] = useState(urlValue);
  const first = useRef(true);
  // Keep the box in sync when the URL changes elsewhere (e.g. "Clear all"): adjust state during render, not in an effect.
  if (seenUrl !== urlValue) {
    setSeenUrl(urlValue);
    setValue(urlValue);
  }
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (value === urlValue) return;
    const t = setTimeout(() => update({ [param]: value || null }), 300);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="pr-8 pl-8" aria-label={placeholder} />
      {value && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setValue("");
            update({ [param]: null });
          }}
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
