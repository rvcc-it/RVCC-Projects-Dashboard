import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ActivityLine, ChartCard, DonutChart, HBarChart, UploadsBar } from "@/components/dashboard/charts";
import { TimelineChart } from "@/components/dashboard/timeline";
import { ProjectsTable } from "@/components/projects/projects-table";
import { requirePageUser } from "@/server/auth";
import { getDashboard } from "@/server/services/dashboard";
import { getFilterOptions, listProjects } from "@/server/services/projects";
import { listSavedFilters } from "@/server/services/saved-filters";
import { parseFilters } from "@/lib/filters";
import { PERMS, hasPerm } from "@/lib/permissions";
import { listParams, type SP } from "@/lib/search-params";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const filters = parseFilters(new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))));
  const lp = listParams(sp, "updated");

  const [data, table, options, saved] = await Promise.all([
    getDashboard(user, filters),
    listProjects(user, filters, lp),
    getFilterOptions(user),
    hasPerm(user, PERMS.filterSave) ? listSavedFilters(user, "dashboard") : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Welcome back, ${user.fullName.split(" ")[0]}. Here is the current state of ${hasPerm(user, PERMS.projectViewAll) ? "all company projects" : "your projects"}.`}
        actions={hasPerm(user, PERMS.projectCreate) && <Link href="/projects/new"><Button><Plus /> New project</Button></Link>}
      />
      <FilterPanel options={options} saved={saved} canSave={hasPerm(user, PERMS.filterSave)} scope="dashboard" />
      <KpiCards k={data.kpis} filters={filters} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Projects by status" subtitle="Click a slice to filter">
          <DonutChart data={data.byStatus} param="status" colors="status" />
        </ChartCard>
        <ChartCard title="Projects by location" subtitle="Top 10 locations · click a bar to filter">
          <HBarChart data={data.byLocation} param="loc" valueKey="label" />
        </ChartCard>
        <ChartCard title="Projects by project manager" subtitle="Click a bar to filter">
          <HBarChart data={data.byManager} param="pm" valueKey="key" />
        </ChartCard>
        <ChartCard title="Projects by category / discipline" subtitle="Click a slice to filter">
          <DonutChart data={data.byCategory} param="cat" />
        </ChartCard>
        <ChartCard title="Project start vs completion" subtitle="Planned duration, progress and actual completion" className="lg:col-span-2">
          <TimelineChart rows={data.timeline} />
        </ChartCard>
        <ChartCard title="Monthly project activity" subtitle="Last 12 months" className="lg:col-span-2">
          <ActivityLine data={data.monthly} />
        </ChartCard>
        <ChartCard title="Documents uploaded over time" subtitle="Uploads incl. new revisions, last 12 months">
          <UploadsBar data={data.docsOverTime} />
        </ChartCard>
      </div>

      <section id="attention" className="mt-6 scroll-mt-24 rounded-xl border bg-card p-4 shadow-card">
        <header className="mb-3 flex items-center gap-2">
          <AlertTriangle className="size-4 text-rose-500" />
          <h3 className="text-sm font-semibold">Projects requiring attention</h3>
          <span className="text-xs text-muted-foreground">on hold, overdue, or more than 25 points behind schedule</span>
        </header>
        {data.attention.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing needs attention for the current filters.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.attention.map((a) => (
              <li key={a.id}>
                <Link href={`/projects/${a.id}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.code} · {a.managerName ?? "Unassigned"}</div>
                    <div className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{a.reason} · {a.progress}% complete</div>
                  </div>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="mt-8 mb-3 text-base font-semibold">Project overview</h2>
      <ProjectsTable items={table.items} total={table.total} page={table.page} pageSize={table.pageSize} canDelete={false} storageKey="overview-cols" />
    </>
  );
}
