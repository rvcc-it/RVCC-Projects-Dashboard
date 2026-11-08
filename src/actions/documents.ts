"use server";
import { safe } from "@/server/safe-action";
import { assertPerm } from "@/server/session-user";
import { PERMS } from "@/lib/permissions";
import { deleteDocument, purgeDocument, purgeExpiredTrash, restoreDocument, updateDocumentMeta } from "@/server/services/documents";

export async function updateDocumentAction(id: string, values: unknown) {
  return safe((u) => updateDocumentMeta(u, id, values));
}
export async function deleteDocumentAction(id: string) {
  return safe((u) => deleteDocument(u, id));
}
export async function restoreDocumentAction(id: string) {
  return safe((u) => restoreDocument(u, id));
}
export async function purgeDocumentAction(id: string) {
  return safe((u) => purgeDocument(u, id));
}
export async function purgeExpiredTrashAction() {
  return safe((u) => {
    assertPerm(u, PERMS.settingsManage);
    return purgeExpiredTrash(u);
  });
}
