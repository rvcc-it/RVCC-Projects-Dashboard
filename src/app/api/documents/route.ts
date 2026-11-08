import { revalidatePath } from "next/cache";
import { handle, json, assertSameOrigin } from "@/server/api";
import { requireUser } from "@/server/auth";
import { createDocument } from "@/server/services/documents";
import { ValidationError } from "@/lib/errors";

// POST multipart/form-data: projectId, title, categoryId, description, revisionLabel, documentDate, file
export async function POST(req: Request) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const form = await req.formData().catch(() => null);
    if (!form) throw new ValidationError("Invalid upload request.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose a PDF file to upload.");
    const str = (k: string) => String(form.get(k) ?? "");
    const res = await createDocument(user, {
      projectId: str("projectId"),
      meta: { title: str("title"), categoryId: str("categoryId"), description: str("description"), revisionLabel: str("revisionLabel"), documentDate: str("documentDate") },
      file: { name: file.name, data: Buffer.from(await file.arrayBuffer()) },
    });
    revalidatePath("/", "layout");
    return json({ ok: true, id: res.id }, 201);
  });
}
