"use server";
import { safe } from "@/server/safe-action";
import { createProject, updateProject, setProjectArchived, deleteProject, restoreProject } from "@/server/services/projects";

export async function createProjectAction(values: unknown) {
  return safe((u) => createProject(u, values));
}
export async function updateProjectAction(id: string, values: unknown) {
  return safe((u) => updateProject(u, id, values));
}
export async function archiveProjectAction(id: string, archived: boolean) {
  return safe((u) => setProjectArchived(u, id, archived));
}
export async function deleteProjectAction(id: string) {
  return safe((u) => deleteProject(u, id));
}
export async function restoreProjectAction(id: string) {
  return safe((u) => restoreProject(u, id));
}
