import "server-only";
import { AppError } from "@/lib/errors";

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function jsonError(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message, fieldErrors: e.fieldErrors, code: e.code }, e.status);
  console.error("[api error]", e);
  return json({ error: "Something went wrong. Please try again." }, 500);
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return jsonError(e);
  }
}

/** Defence in depth on top of SameSite=Lax cookies: reject cross-origin state-changing requests. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let o: string;
  try {
    o = new URL(origin).host;
  } catch {
    throw new AppError("Bad origin", 403, "forbidden");
  }
  if (host && o !== host) throw new AppError("Cross-origin request blocked.", 403, "forbidden");
}

export function contentDisposition(kind: "inline" | "attachment", filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
