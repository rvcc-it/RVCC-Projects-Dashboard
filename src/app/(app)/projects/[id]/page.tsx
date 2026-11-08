import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, CalendarClock, Download, FileText, FolderKanban, MapPin, Pencil, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { Pagination } from "@/components/common/pagination";
import { ActivityFeed } from "@/components/projects/activity-feed";
import { ProjectRowActions } from "@/components/projects/row-actions";
import { TeamPanel } from "@/components/projects/team-panel";
import { UploadsBar } from "@/components/dashboard/charts";
import { DocumentFilters } from "@/components/documents/document-filters";
import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { requirePageUser } from "@/server/auth";
import { getProject } from "@/server/services/projects";
import { getProjectDocStats, listDocuments, listProjectOptions, listUploaders } from "@/server/services/documents";
import { listCategories } from "@/server/services/categories";
import { listAssignableUsers, listMembers } from "@/server/services/team";
import { listActivity } from "@/server/services/activity-log";
import { getSettings } from "@/server/services/settings";
import { NotFoundError } from "@/lib/errors";
import { PERMS, hasPerm } from "@/lib/permissions";
import { formatBytes, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { listParams, str, type SP } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Project" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "reports", label: "Reports" },
  { id: "team", label: "Team" },
  { id: "activity", label: "Activity Log" },
] as const;

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children || "—"}</dd>
    </div>
  );
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePageUser();
  const p = await getProject(user, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const tab = TABS.find((t) => t.id === str(sp.tab))?.id ?? "overview";
  const canDownload = hasPerm(user, PERMS.documentDownload);

  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const daysLeft = p.expectedCompletion ? Math.round((new Date(p.expectedCompletion).getTime() - today) / 86400_000) : null;
  const open = p.status === "planning" || p.status === "active" || p.status === "on_hold";
  const elapsedPct = p.startDate && p.expectedCompletion && p.expectedCompletion > p.startDate
    ? Math.max(0, Math.min(100, Math.round(((today - new Date(p.startDate).getTime()) / (new Date(p.expectedCompletion).getTime() - new Date(p.startDate).getTime())) * 100))) : null;

  return (
    <>
      {/* ---------- header ---------- */}
      <div className="mb-6 overflow-hidden rounded-xl border bg-card shadow-card">
        {p.hasCover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/projects/${p.id}/cover`} alt="" className="h-36 w-full object-cover sm:h-44" />
        )}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{p.code}</span>
              <StatusBadge status={p.status} />
              {p.isArchived && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"><Archive className="size-3" /> Archived</span>}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{p.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {p.location}</span>
              <span>{p.clientName}</span>
              <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {p.managerName ?? "No project manager"}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {p.caps.edit && <Link href={`/projects/${p.id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil /> Edit</Link>}
            {(p.caps.edit || hasPerm(user, PERMS.projectDelete)) && (
              <ProjectRowActions id={p.id} code={p.code} name={p.name} isArchived={p.isArchived} canEdit={p.caps.edit} canDelete={hasPerm(user, PERMS.projectDelete)} docCount={p.docCount} afterDelete="/projects" hideView />
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t px-3" aria-label="Project sections">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.id === "overview" ? `/projects/${p.id}` : `/projects/${p.id}?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn("relative px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors", tab === t.id ? "text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
              {t.id === "documents" && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{p.docCount}</span>}
              {t.id === "team" && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{p.memberCount}</span>}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "overview" && <OverviewTab p={p} user={user} daysLeft={daysLeft} open={open} elapsedPct={elapsedPct} canDownload={canDownload} />}
      {tab === "documents" && <DocumentsTab p={p} user={user} sp={sp} canDownload={canDownload} />}
      {tab === "reports" && <ReportsTab p={p} user={user} />}
      {tab === "team" && <TeamTab p={p} user={user} />}
      {tab === "activity" && <ActivityTab p={p} user={user} sp={sp} />}
    </>
  );
}

type P = Awaited<ReturnType<typeof getProject>>;
type U = Awaited<ReturnType<typeof requirePageUser>>;

async function OverviewTab({ p, user, daysLeft, open, elapsedPct, canDownload }: { p: P; user: U; daysLeft: number | null; open: boolean; elapsedPct: number | null; canDownload: boolean }) {
  const [docs, activity] = await Promise.all([
    listDocuments(user, { projectId: p.id, pageSize: 5, sort: "date", dir: "desc" }),
    listActivity(user, { projectId: p.id, pageSize: 6 }),
  ]);
  const late = open && daysLeft !== null && daysLeft < 0;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="grid content-start gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="col-span-2 rounded-xl border bg-card p-4 shadow-card">
            <div className="flex items-baseline justify-between"><span className="text-xs font-medium text-muted-foreground">Overall progress</span><span className="text-2xl font-semibold tabular-nums">{p.progress}%</span></div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.progress}%` }} /></div>
            {elapsedPct !== null && open && <p className="mt-2 text-xs text-muted-foreground">{elapsedPct}% of scheduled time elapsed{p.progress + 25 < elapsedPct ? " — behind schedule" : ""}</p>}
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-card">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarClock className="size-3.5" /> Schedule</span>
            <div className={cn("mt-2 text-2xl font-semibold tabular-nums", late && "text-rose-600 dark:text-rose-400")}>{daysLeft === null ? "—" : open ? `${Math.abs(daysLeft)}d` : "Closed"}</div>
            <p className="text-xs text-muted-foreground">{daysLeft === null || !open ? `Expected ${formatDate(p.expectedCompletion)}` : late ? "overdue" : "remaining"}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-card">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><FileText className="size-3.5" /> Documents</span>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{p.docCount}</div>
            <p className="text-xs text-muted-foreground">{p.memberCount} team member{p.memberCount === 1 ? "" : "s"}</p>
          </div>
        </div>

        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-4 text-sm font-semibold">Key information</h2>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Client">{p.clientName}</Info>
            <Info label="Main contractor">{p.mainContractor}</Info>
            <Info label="Consultant">{p.consultant}</Info>
            <Info label="Location">{p.location}</Info>
            <Info label="Category">{p.category}</Info>
            <Info label="Project manager">{p.managerName}</Info>
            <Info label="Start date">{formatDate(p.startDate)}</Info>
            <Info label="Expected completion">{formatDate(p.expectedCompletion)}</Info>
            <Info label="Actual completion">{formatDate(p.actualCompletion)}</Info>
            {p.contractValueVisible && <Info label="Contract value">{formatMoney(p.contractValue, p.currency)}</Info>}
            <Info label="Created">{formatDateTime(p.createdAt)}{p.createdByName ? ` · ${p.createdByName}` : ""}</Info>
            <Info label="Last updated">{formatDateTime(p.updatedAt)}{p.updatedByName ? ` · ${p.updatedByName}` : ""}</Info>
          </dl>
          {p.description && <p className="mt-5 border-t pt-4 text-sm whitespace-pre-wrap text-muted-foreground">{p.description}</p>}
          {p.remarks && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm"><b>Remarks:</b> {p.remarks}</p>}
        </section>

        <section className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-sm font-semibold">Latest documents</h2>
            <Link href={`/projects/${p.id}?tab=documents`} className="text-sm font-medium text-primary hover:underline">View all</Link>
          </div>
          {docs.items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y">
              {docs.items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600"><FileText className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/documents/${d.id}`} className="block truncate text-sm font-medium hover:text-primary">{d.title}</Link>
                    <p className="truncate text-xs text-muted-foreground">{d.category} · Rev {d.revisionLabel} · {d.uploaderName ?? "—"} · {formatDate(d.uploadedAt)} · {formatBytes(d.fileSize)}</p>
                  </div>
                  {canDownload && <a href={`/api/documents/${d.id}/file?download=1`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={`Download ${d.title}`}><Download /></a>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="rounded-xl border bg-card p-5 shadow-card xl:self-start">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link href={`/projects/${p.id}?tab=activity`} className="text-sm font-medium text-primary hover:underline">All</Link>
        </div>
        <ActivityFeed items={activity.items} />
      </aside>
    </div>
  );
}

async function DocumentsTab({ p, user, sp, canDownload }: { p: P; user: U; sp: SP; canDownload: boolean }) {
  const lp = listParams(sp, "date");
  const [docs, projects, categories, uploaders, settings] = await Promise.all([
    listDocuments(user, { q: str(sp.q), projectId: p.id, categoryId: str(sp.category), uploaderId: str(sp.uploader), from: str(sp.from), to: str(sp.to), sort: lp.sort, dir: lp.dir, page: lp.page, pageSize: lp.pageSize }),
    listProjectOptions(user), listCategories(user), listUploaders(user), getSettings(user),
  ]);
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Project documents</h2>
        {p.caps.upload && <UploadDialog projects={projects} categories={categories.filter((c) => c.isActive)} maxUploadMb={settings.maxUploadMb} defaultProjectId={p.id} />}
      </div>
      <DocumentFilters projects={projects} categories={categories} uploaders={uploaders} hideProject />
      <DocumentsTable items={docs.items} total={docs.total} page={docs.page} pageSize={docs.pageSize} projects={projects} categories={categories.filter((c) => c.isActive)} maxUploadMb={settings.maxUploadMb} canDownload={canDownload} canPurge={false} hideProject />
    </section>
  );
}

async function ReportsTab({ p, user }: { p: P; user: U }) {
  const stats = await getProjectDocStats(user, p.id);
  const max = Math.max(1, ...stats.byCategory.map((c) => c.count));
  const canExport = hasPerm(user, PERMS.reportExport);
  const monthly = stats.monthly.map((m) => ({ month: m.month, label: new Date(m.month + "-01").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), a: m.count, b: 0 }));
  const reports = [
    ["project_status", "Project status"], ["project_documents", "Document summary"], ["document_uploads", "Upload log"], ["recent_activity", "Activity log"],
  ] as const;
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Documents", stats.documents], ["Revisions", stats.revisions], ["Storage used", formatBytes(stats.bytes)], ["Last upload", stats.lastUpload ? formatDate(stats.lastUpload) : "—"]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border bg-card p-4 shadow-card"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-4 text-sm font-semibold">Documents by category</h2>
          {stats.byCategory.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No documents yet.</p> : (
            <ul className="grid gap-3">
              {stats.byCategory.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-sm"><span>{c.category}</span><span className="tabular-nums text-muted-foreground">{c.count}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-1 text-sm font-semibold">Uploads per month</h2>
          <UploadsBar data={monthly} />
        </section>
      </div>
      {canExport && (
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-1 text-sm font-semibold">Export project reports</h2>
          <p className="mb-4 text-xs text-muted-foreground">Exports contain only this project ({p.code}) and respect your permissions.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {reports.map(([type, label]) => (
              <div key={type} className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">{label}</span>
                <div className="flex gap-1.5">
                  {(["csv", "xlsx", "pdf"] as const).map((f) => (
                    <a key={f} href={`/api/reports/export?type=${type}&format=${f}&code=${encodeURIComponent(p.code)}&archived=include`} className={buttonVariants({ variant: "outline", size: "xs" })}><Download /> {f.toUpperCase()}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

async function TeamTab({ p, user }: { p: P; user: U }) {
  const [members, assignable] = await Promise.all([listMembers(user, p.id), p.caps.manageTeam ? listAssignableUsers(user, p.id) : Promise.resolve([])]);
  return <TeamPanel projectId={p.id} members={members} assignable={assignable} canManage={p.caps.manageTeam} />;
}

async function ActivityTab({ p, user, sp }: { p: P; user: U; sp: SP }) {
  const lp = listParams(sp, "date");
  const a = await listActivity(user, { projectId: p.id, page: lp.page, pageSize: lp.pageSize });
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">Activity log</h2>
        <p className="text-xs text-muted-foreground">Complete audit trail for this project, including previous and new values.</p>
      </div>
      <div className="p-5"><ActivityFeed items={a.items} /></div>
      <Pagination total={a.total} page={a.page} pageSize={a.pageSize} noun="events" />
    </section>
  );
}
