"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action";

/** Runs a server action, shows success/error toasts and refreshes server data. */
export function useRunAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; onSuccess?: (d: T) => void } = {}) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (opts.success) toast.success(opts.success);
        opts.onSuccess?.(r.data);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  return { run, pending };
}
