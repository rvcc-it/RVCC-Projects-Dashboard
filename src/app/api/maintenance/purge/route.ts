import crypto from "node:crypto";
import { handle, json } from "@/server/api";
import { purgeExpiredTrash } from "@/server/services/documents";
import { AppError } from "@/lib/errors";

// Scheduled retention job (system cron / Vercel Cron): POST /api/maintenance/purge  with  Authorization: Bearer $CRON_SECRET
export async function POST(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const ok = !!secret && secret !== "change-me" && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) throw new AppError("Unauthorized", 401, "unauthorized");
    return json({ ok: true, ...(await purgeExpiredTrash(null)) });
  });
}
export const GET = POST; // Vercel Cron issues GET requests
