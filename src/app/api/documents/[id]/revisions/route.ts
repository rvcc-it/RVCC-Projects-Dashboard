import { revalidatePath } from "next/cache";
import { handle, json, assertSameOrigin } from "@/server/api";
import { requireUser } from "@/server/auth";
import { uploadRevision } from "@/server/services/documents";
import { ValidationError } from "@/lib/errors";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { id } = await ctx.params;
    const form = await req.formData().catch(() => null);
    if (!form) throw new ValidationError("Invalid upload request.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose a PDF file to upload.");
    const res = await uploadRevision(user, id, {
      revisionLabel: String(form.get("revisionLabel") ?? ""),
      notes: String(form.get("notes") ?? ""),
      file: { name: file.name, data: Buffer.from(await file.arrayBuffer()) },
    });
    revalidatePath("/", "layout");
    return json({ ok: true, ...res }, 201);
  });
}
