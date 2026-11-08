"use client";
import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Update URL search params (the single source of truth for filters/sort/page) without a full reload. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const update = useCallback(
    (patch: Record<string, string | string[] | null | undefined>, opts: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        next.delete(k);
        if (Array.isArray(v)) v.filter(Boolean).forEach((x) => next.append(k, x));
        else if (v) next.set(k, v);
      }
      if (opts.resetPage !== false && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [sp, pathname, router],
  );
  return { update, pending, params: sp, pathname };
}
