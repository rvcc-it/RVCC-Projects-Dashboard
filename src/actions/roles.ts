"use server";
import { safe } from "@/server/safe-action";
import { createRole, deleteRole, setRolePermissions } from "@/server/services/roles";

export async function setRolePermissionsAction(roleId: string, codes: string[]) {
  return safe((u) => setRolePermissions(u, roleId, codes));
}
export async function createRoleAction(values: unknown) {
  return safe((u) => createRole(u, values));
}
export async function deleteRoleAction(id: string) {
  return safe((u) => deleteRole(u, id));
}
