"use server";
import { safe } from "@/server/safe-action";
import { updateSettings } from "@/server/services/settings";

export async function updateSettingsAction(values: { retentionDays: number; maxUploadMb: number }) {
  return safe((u) => updateSettings(u, { retentionDays: Number(values.retentionDays), maxUploadMb: Number(values.maxUploadMb) }));
}
