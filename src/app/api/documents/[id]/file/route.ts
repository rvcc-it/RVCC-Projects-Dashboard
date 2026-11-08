import { handle, contentDisposition } from "@/server/api";
import { requireUser } from "@/server/auth";
import { assertPerm } from "@/server/session-user";
import { PERMS } from "@/lib/permissions";
import { getRevisionFile, logDownload } from "@/server/services/documents";
import { getStorage } from "@/server/storage";
import { NotFoundError } from "@/lib/errors";

// Authenticated, permission-checked file access. Storage is private: there is no public URL for any document.
//   GET /api/documents/:id/file               -> inline preview of the current revision
//   GET /api/documents/:id/file?rev=2         -> a specific revision
//   GET /api/documents/:id/file?download=1    -> attachment (requires document.download) and is audit-logged
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const revParam = url.searchParams.get("rev");
    const rev = revParam ? Number(revParam) : undefined;
    if (revParam && (!Number.isInteger(rev) || (rev as number) < 1)) throw new NotFoundError();
    const download = url.searchParams.get("download") === "1";
    if (download) assertPerm(user, PERMS.documentDownload, "You do not have permission to download documents.");

    const f = await getRevisionFile(user, id, rev); // RLS: throws 404 unless the user can see the project
    const data = await getStorage().get(f.key);
    if (download) await logDownload(user, { docId: f.docId, projectId: f.projectId, title: f.title, revisionLabel: f.revisionLabel });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(data.length),
        "Content-Disposition": contentDisposition(download ? "attachment" : "inline", f.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
