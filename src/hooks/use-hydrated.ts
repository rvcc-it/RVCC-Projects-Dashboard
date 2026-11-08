"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** false during server render + hydration, true afterwards. Used to avoid showing empty form fields before React Hook Form fills them. */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
