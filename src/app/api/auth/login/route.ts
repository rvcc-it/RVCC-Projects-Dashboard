import { handle, json, assertSameOrigin } from "@/server/api";
import { login } from "@/server/auth";
import { loginSchema } from "@/lib/validators";
import { ValidationError } from "@/lib/errors";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const body = await req.json().catch(() => null);
    const p = loginSchema.safeParse(body);
    if (!p.success) throw new ValidationError(p.error.issues[0].message);
    const user = await login(p.data.identifier, p.data.password, !!p.data.remember);
    return json({ ok: true, mustChangePassword: user.mustChangePassword });
  });
}
