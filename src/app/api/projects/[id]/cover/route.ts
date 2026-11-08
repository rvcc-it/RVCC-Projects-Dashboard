import { revalidatePath } from "next/cache";
import { handle, json, assertSameOrigin } from "@/server/api";
import { requireUser } from "@/server/auth";
import { getProjectCover, setProjectCover } from "@/server/services/projects";
import { ValidationError } from "@/lib/errors";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { data, mime } = await getProjectCover(user, id);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose an image.");
    await setProjectCover(user, id, Buffer.from(await file.arrayBuffer()));
    revalidatePath("/", "layout");
    return json({ ok: true });
  });
}
