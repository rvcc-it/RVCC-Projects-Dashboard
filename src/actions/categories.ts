"use server";
import { safe } from "@/server/safe-action";
import { createCategory, deleteCategory, updateCategory } from "@/server/services/categories";

export async function createCategoryAction(values: unknown) {
  return safe((u) => createCategory(u, values));
}
export async function updateCategoryAction(id: string, values: unknown) {
  return safe((u) => updateCategory(u, id, values));
}
export async function deleteCategoryAction(id: string, reassignToId?: string) {
  return safe((u) => deleteCategory(u, id, reassignToId));
}
