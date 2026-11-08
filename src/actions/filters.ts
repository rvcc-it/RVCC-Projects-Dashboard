"use server";
import { safe } from "@/server/safe-action";
import { parseFilters } from "@/lib/filters";
import { deleteSavedFilter, saveFilter } from "@/server/services/saved-filters";

export async function saveFilterAction(name: string, query: string, scope = "dashboard") {
  return safe((u) => saveFilter(u, name, parseFilters(new URLSearchParams(query)), scope === "projects" || scope === "reports" ? scope : "dashboard"));
}
export async function deleteSavedFilterAction(id: string) {
  return safe((u) => deleteSavedFilter(u, id));
}
