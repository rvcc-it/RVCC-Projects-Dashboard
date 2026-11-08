import { handle, contentDisposition } from "@/server/api";
import { requireUser } from "@/server/auth";
import { assertPerm } from "@/server/session-user";
import { PERMS } from "@/lib/permissions";
import { parseFilters } from "@/lib/filters";
import { runReport } from "@/server/services/reports";
import { toCsv, toPdf, toXlsx } from "@/server/export";
import { ValidationError } from "@/lib/errors";
import { withUser } from "@/lib/db";
import { logActivity } from "@/server/activity";

// GET /api/reports/export?type=project_status&format=csv|xlsx|pdf&<slicer filters>&from=&to=
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    assertPerm(user, PERMS.reportExport, "You do not have permission to export reports.");
    const sp = new URL(req.url).searchParams;
    const format = sp.get("format") ?? "csv";
    if (!["csv", "xlsx", "pdf"].includes(format)) throw new ValidationError("Unsupported export format.");
    const report = await runReport(user, sp.get("type") ?? "", parseFilters(sp), { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
    await withUser(user.id, (db) =>
      logActivity(db, user, { action: "report.export", entityType: "report", summary: `Exported "${report.title}" as ${format.toUpperCase()} (${report.rows.length} rows)` }),
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `${report.type}_${stamp}`;
    const [body, mime] =
      format === "xlsx"
        ? [await toXlsx(report), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
        : format === "pdf"
          ? [toPdf(report), "application/pdf"]
          : [toCsv(report), "text/csv; charset=utf-8"];
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": mime, "Content-Disposition": contentDisposition("attachment", `${base}.${format}`), "Cache-Control": "private, no-store" },
    });
  });
}
