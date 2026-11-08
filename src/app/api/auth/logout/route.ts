import { handle, json, assertSameOrigin } from "@/server/api";
import { destroySession } from "@/server/auth";

export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    await destroySession();
    return json({ ok: true });
  });
}
