import type { Metadata } from "next";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DocumentFilters } from "@/components/documents/document-filters";
import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { requirePageUser } from "@/server/auth";
import { listDocuments, listProjectOptions, listUploaders } from "@/server/services/documents";
import { listCategories } from "@/server/services/categories";
import { getSettings } from "@/server/services/settings";
import { PERMS, hasPerm } from "@/lib/permissions";
import { listParams, str, type SP } from "@/lib/search-params";

export const metadata: Metadata = { title: "Project Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const lp = listParams(sp, "date");
  const canSeeTrash = hasPerm(user, PERMS.documentDeleteAll) || hasPerm(user, PERMS.documentDeleteAssigned);
  const trash = canSeeTrash && str(sp.trash) === "1";

  const [docs, projects, categories, uploaders, settings] = await Promise.all([
    listDocuments(user, {
      q: str(sp.q), projectId: str(sp.project), categoryId: str(sp.category), uploaderId: str(sp.uploader), from: str(sp.from), to: str(sp.to),
      sort: lp.sort, dir: lp.dir, page: lp.page, pageSize: lp.pageSize, trash,
    }),
    listProjectOptions(user),
    listCategories(user),
    listUploaders(user),
    getSettings(user),
  ]);
  const active = categories.filter((c) => c.isActive);

  return (
    <>
      <PageHeader
        title={trash ? "Document trash" : "Project Documents"}
        description={trash ? "Deleted documents can be restored until the retention period ends." : "Search, preview and manage PDF documents across the projects you can access."}
        actions={<UploadDialog projects={projects} categories={active} maxUploadMb={settings.maxUploadMb} />}
      />
      {trash && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
          Documents in the trash are permanently erased (database records and files) {settings.retentionDays} days after deletion by the scheduled retention job.
        </div>
      )}
      <section className="rounded-xl border bg-card shadow-card">
        <DocumentFilters projects={projects} categories={categories} uploaders={uploaders} canSeeTrash={canSeeTrash} />
        <DocumentsTable
          items={docs.items} total={docs.total} page={docs.page} pageSize={docs.pageSize} projects={projects} categories={active} maxUploadMb={settings.maxUploadMb}
          canDownload={hasPerm(user, PERMS.documentDownload)} canPurge={hasPerm(user, PERMS.documentDeleteAll)} trash={trash}
        />
      </section>
    </>
  );
}
