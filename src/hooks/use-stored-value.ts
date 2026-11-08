"use client";
import { useCallback, useSyncExternalStore } from "react";

const EVENT = "rvcc:stored-value";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/**
 * localStorage-backed string, safe for SSR (server snapshot = null) and hydration (React reconciles after mount).
 * Storage may be unavailable (private mode, blocked): reads fall back to null and writes are ignored.
 */
export function useStoredValue(key: string): [string | null, (v: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = useCallback(
    (v: string | null) => {
      try {
        if (v === null) localStorage.removeItem(key);
        else localStorage.setItem(key, v);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
