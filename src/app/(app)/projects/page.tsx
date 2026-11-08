import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { FilterPanel } from "@/components/dashboard/filter-panel";
import { ProjectsTable } from "@/components/projects/projects-table";
import { requirePageUser } from "@/server/auth";
import { getFilterOptions, listProjects } from "@/server/services/projects";
import { listSavedFilters } from "@/server/services/saved-filters";
import { parseFilters } from "@/lib/filters";
import { PERMS, hasPerm } from "@/lib/permissions";
import { listParams, type SP } from "@/lib/search-params";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const filters = parseFilters(new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : []))));
  const [table, options, saved] = await Promise.all([
    listProjects(user, filters, listParams(sp, "updated")),
    getFilterOptions(user),
    hasPerm(user, PERMS.filterSave) ? listSavedFilters(user, "projects") : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title="Projects"
        description="Create, review and manage every project you have access to."
        actions={hasPerm(user, PERMS.projectCreate) && <Link href="/projects/new"><Button><Plus /> New project</Button></Link>}
      />
      <FilterPanel options={options} saved={saved} canSave={hasPerm(user, PERMS.filterSave)} scope="projects" showArchive />
      <ProjectsTable items={table.items} total={table.total} page={table.page} pageSize={table.pageSize} canDelete={hasPerm(user, PERMS.projectDelete)} withActions storageKey="projects-page-cols" />
    </>
  );
}
