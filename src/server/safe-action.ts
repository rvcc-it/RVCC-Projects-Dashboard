import "server-only";
import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/action";
import { requireUser } from "@/server/auth";
import type { SessionUser } from "@/server/session-user";

/**
 * Wraps a server action: authenticates the session, runs the handler (which performs its own
 * permission checks + Zod validation), converts errors to a typed result, and refreshes cached data.
 */
export async function safe<T>(fn: (user: SessionUser) => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    const data = await fn(user);
    if (opts.revalidate !== false) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    // let Next.js control-flow errors (redirect / notFound) pass through
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
