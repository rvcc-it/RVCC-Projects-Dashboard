import { z } from "zod";
import { handle, json, assertSameOrigin } from "@/server/api";
import { resetPasswordWithToken } from "@/server/auth";
import { ValidationError } from "@/lib/errors";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const p = z.object({ token: z.string().min(20).max(200), password: z.string().max(128) }).safeParse(await req.json().catch(() => null));
    if (!p.success) throw new ValidationError("Invalid request.");
    await resetPasswordWithToken(p.data.token, p.data.password);
    return json({ ok: true });
  });
}
