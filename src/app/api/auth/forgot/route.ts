import { z } from "zod";
import { handle, json, assertSameOrigin } from "@/server/api";
import { requestPasswordReset } from "@/server/auth";
import { ValidationError } from "@/lib/errors";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const p = z.object({ email: z.string().trim().email().max(200) }).safeParse(await req.json().catch(() => null));
    if (!p.success) throw new ValidationError("Enter a valid e-mail address.");
    await requestPasswordReset(p.data.email).catch((e) => console.error("[forgot]", e));
    // identical response whether or not the account exists
    return json({ ok: true });
  });
}
