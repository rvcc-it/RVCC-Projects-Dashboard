"use server";
import { safe } from "@/server/safe-action";
import { changeOwnPassword } from "@/server/auth";
import { ValidationError } from "@/lib/errors";
import { changePasswordSchema } from "@/lib/validators";
import { adminResetPassword, createUser, deleteUser, updateOwnProfile, updateUser } from "@/server/services/users";

export async function createUserAction(values: unknown) {
  return safe((u) => createUser(u, values));
}
export async function updateUserAction(id: string, values: unknown) {
  return safe((u) => updateUser(u, id, values));
}
export async function deleteUserAction(id: string) {
  return safe((u) => deleteUser(u, id));
}
export async function resetUserPasswordAction(id: string) {
  return safe((u) => adminResetPassword(u, id));
}
export async function updateProfileAction(values: unknown) {
  return safe((u) => updateOwnProfile(u, values));
}
export async function changePasswordAction(values: unknown) {
  return safe(async (u) => {
    const p = changePasswordSchema.safeParse(values);
    if (!p.success) {
      const fe: Record<string, string> = {};
      p.error.issues.forEach((i) => (fe[String(i.path[0])] ??= i.message));
      throw new ValidationError("Please correct the highlighted fields.", fe);
    }
    await changeOwnPassword(u, p.data.currentPassword, p.data.newPassword);
  });
}
