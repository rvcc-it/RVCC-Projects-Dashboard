"use server";
import { safe } from "@/server/safe-action";
import { clearReadNotifications, deleteNotification, markAllRead, markRead } from "@/server/services/notifications";

export async function markReadAction(id: string, read = true) {
  return safe((u) => markRead(u, id, read));
}
export async function markAllReadAction() {
  return safe((u) => markAllRead(u));
}
export async function deleteNotificationAction(id: string) {
  return safe((u) => deleteNotification(u, id));
}
export async function clearReadAction() {
  return safe((u) => clearReadNotifications(u));
}
