import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, FileText, FileType2, Table2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenNotice } from "@/components/common/forbidden-notice";
import { EmptyState } from "@/components/common/empty-state";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { ReportDates } from "@/components/reports/report-dates";
import { requirePageUser } from "@/server/auth";
import { REPORT_TYPES, runReport, type ColType } from "@/server/services/reports";
import { getFilterOptions } from "@/server/services/projects";
import { listSavedFilters } from "@/server/services/saved-filters";
import { parseFilters } from "@/lib/filters";
import { PERMS, hasPerm } from "@/lib/permissions";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { str, type SP } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Project Reports" };

const PREVIEW_ROWS = 200;
function cell(v: string | number | null, t: ColType) {
  if (v === null || v === undefined || v === "") return "—";
  if (t === "date") return formatDate(String(v));
  if (t === "datetime") return formatDateTime(String(v));
  if (t === "bytes") return formatBytes(Number(v));
  if (t === "percent") return `${v}%`;
  return String(v);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  if (!hasPerm(user, PERMS.reportView)) return <ForbiddenNotice message="You do not have access to reports." />;
  const sp = await searchParams;
  const usp = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : [])));
  const filters = parseFilters(usp);
  const type = REPORT_TYPES.find((r) => r.key === str(sp.type))?.key ?? "project_status";
  const from = str(sp.from);
  const to = str(sp.to);
  const [report, options, saved] = await Promise.all([
    runReport(user, type, filters, { from, to }),
    getFilterOptions(user),
    hasPerm(user, PERMS.filterSave) ? listSavedFilters(user, "reports") : Promise.resolve([]),
  ]);
  const canExport = hasPerm(user, PERMS.reportExport);
  const withType = (t: string) => { const q = new URLSearchParams(usp); q.set("type", t); return `/reports?${q.toString()}`; };
  const exportHref = (f: string) => { const q = new URLSearchParams(usp); q.set("type", type); q.set("format", f); ["page", "size", "sort", "dir"].forEach((k) => q.delete(k)); return `/api/reports/export?${q.toString()}`; };
  const usesDates = type === "document_uploads" || type === "recent_activity";

  return (
    <>
      <PageHeader
        title="Project Reports"
        description="Reports reflect live database records, your permissions and the filters below."
        actions={canExport && (
          <>
            <a href={exportHref("csv")} className={buttonVariants({ variant: "outline" })}><Table2 /> CSV</a>
            <a href={exportHref("xlsx")} className={buttonVariants({ variant: "outline" })}><FileSpreadsheet /> Excel</a>
            <a href={exportHref("pdf")} className={buttonVariants({ variant: "outline" })}><FileType2 /> PDF</a>
          </>
        )}
      />
      <FilterPanel options={options} saved={saved} canSave={hasPerm(user, PERMS.filterSave)} scope="reports" showArchive />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Report types" className="grid content-start gap-1.5">
          {REPORT_TYPES.map((r) => (
            <Link key={r.key} href={withType(r.key)} aria-current={r.key === type ? "page" : undefined} className={cn("rounded-lg border p-3 transition-colors", r.key === type ? "border-primary bg-primary/5" : "bg-card hover:border-primary/40")}>
              <div className="text-sm font-medium">{r.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{r.description}</div>
            </Link>
          ))}
        </nav>
        <section className="min-w-0 rounded-xl border bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="text-sm font-semibold">{report.title}</h2>
              <p className="text-xs text-muted-foreground">
                {report.rows.length.toLocaleString()} row{report.rows.length === 1 ? "" : "s"}{report.truncated ? " (first 5,000)" : ""} · generated {formatDateTime(report.generatedAt)}
              </p>
            </div>
            {usesDates && <ReportDates />}
          </div>
          {report.rows.length === 0 ? (
            <EmptyState icon={FileText} title="No data for this report" description="Try clearing filters or widening the date range." />
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key} className={cn("px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground", (c.type === "number" || c.type === "percent" || c.type === "bytes") && "text-right")}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/40">
                      {report.columns.map((c) => (
                        <td key={c.key} className={cn("px-3 py-2", c.type === "text" ? "max-w-72 truncate" : "whitespace-nowrap", (c.type === "number" || c.type === "percent" || c.type === "bytes") && "text-right tabular-nums")} title={c.type === "text" ? String(r[c.key] ?? "") : undefined}>
                          {cell(r[c.key], c.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report.rows.length > PREVIEW_ROWS && (
            <p className="flex items-center gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground"><Download className="size-3.5" /> Showing the first {PREVIEW_ROWS} rows. Export to get all {report.rows.length.toLocaleString()}.</p>
          )}
        </section>
      </div>
    </>
  );
}
