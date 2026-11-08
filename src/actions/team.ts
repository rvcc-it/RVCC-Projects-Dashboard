"use server";
import { safe } from "@/server/safe-action";
import { addMember, removeMember, updateMember } from "@/server/services/team";

export async function addMemberAction(projectId: string, values: unknown) {
  return safe((u) => addMember(u, projectId, values));
}
export async function updateMemberAction(projectId: string, memberId: string, values: unknown) {
  return safe((u) => updateMember(u, projectId, memberId, values));
}
export async function removeMemberAction(projectId: string, memberId: string) {
  return safe((u) => removeMember(u, projectId, memberId));
}
