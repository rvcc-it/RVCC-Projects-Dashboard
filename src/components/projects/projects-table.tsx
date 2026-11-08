"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useStoredValue } from "@/hooks/use-stored-value";
import { Archive, Columns3, FolderSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortHead } from "@/components/common/sort-head";
import { Pagination } from "@/components/common/pagination";
import { SearchInput } from "@/components/common/search-input";
import { EmptyState } from "@/components/common/empty-state";
import { ProgressBar, StatusBadge } from "@/components/common/status-badge";
import { ProjectRowActions } from "@/components/projects/row-actions";
import { formatDate, timeAgo } from "@/lib/format";
import type { ProjectListItem } from "@/server/services/projects";

type ColId = "code" | "name" | "client" | "location" | "manager" | "status" | "start" | "expected" | "progress" | "docs" | "updated";
const COLS: { id: ColId; label: string; sort: string; locked?: boolean }[] = [
  { id: "code", label: "Project Code", sort: "code" },
  { id: "name", label: "Project Name", sort: "name", locked: true },
  { id: "client", label: "Client", sort: "client" },
  { id: "location", label: "Location", sort: "location" },
  { id: "manager", label: "Project Manager", sort: "manager" },
  { id: "status", label: "Status", sort: "status" },
  { id: "start", label: "Start Date", sort: "start" },
  { id: "expected", label: "Expected Completion", sort: "expected" },
  { id: "progress", label: "Progress", sort: "progress" },
  { id: "docs", label: "Documents", sort: "docs" },
  { id: "updated", label: "Last Updated", sort: "updated" },
];

export function ProjectsTable({
  items, total, page, pageSize, canDelete, withActions = false, storageKey = "projects-cols", toolbar,
}: { items: ProjectListItem[]; total: number; page: number; pageSize: number; canDelete: boolean; withActions?: boolean; storageKey?: string; toolbar?: React.ReactNode }) {
  const [raw, setRaw] = useStoredValue(storageKey);
  const hidden = useMemo<ColId[]>(() => {
    try {
      return raw ? (JSON.parse(raw) as ColId[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
  const toggle = (id: ColId, on: boolean) => setRaw(JSON.stringify(on ? hidden.filter((h) => h !== id) : [...hidden, id]));
  const show = (id: ColId) => !hidden.includes(id);

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
        <SearchInput placeholder="Search code, name, client, location, manager…" className="w-full sm:w-80" />
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Columns3 /> Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              </DropdownMenuGroup>
              {COLS.map((c) => (
                <DropdownMenuCheckboxItem key={c.id} checked={show(c.id)} disabled={c.locked} onCheckedChange={(v) => toggle(c.id, v)}>
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={FolderSearch} title="No projects match" description="Try removing some filters or changing the search term." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {COLS.filter((c) => show(c.id)).map((c) => (
                  <SortHead key={c.id} id={c.sort} className="whitespace-nowrap">{c.label}</SortHead>
                ))}
                {withActions && <th className="w-10" aria-label="Actions" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} className="group">
                  {show("code") && <TableCell className="font-mono text-xs whitespace-nowrap">{p.code}</TableCell>}
                  <TableCell className="min-w-56 font-medium">
                    <Link href={`/projects/${p.id}`} className="hover:text-primary hover:underline">{p.name}</Link>
                    {p.isArchived && <span className="ml-2 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"><Archive className="size-3" /> Archived</span>}
                  </TableCell>
                  {show("client") && <TableCell className="max-w-48 truncate text-muted-foreground">{p.clientName}</TableCell>}
                  {show("location") && <TableCell className="whitespace-nowrap">{p.location}</TableCell>}
                  {show("manager") && <TableCell className="whitespace-nowrap">{p.managerName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>}
                  {show("status") && <TableCell><StatusBadge status={p.status} /></TableCell>}
                  {show("start") && <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(p.startDate)}</TableCell>}
                  {show("expected") && <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(p.expectedCompletion)}</TableCell>}
                  {show("progress") && <TableCell className="min-w-36"><ProgressBar value={p.progress} /></TableCell>}
                  {show("docs") && <TableCell className="text-center tabular-nums">{p.docCount}</TableCell>}
                  {show("updated") && <TableCell className="whitespace-nowrap text-muted-foreground" title={formatDate(p.updatedAt)}>{timeAgo(p.updatedAt)}</TableCell>}
                  {withActions && (
                    <TableCell className="text-right">
                      <ProjectRowActions id={p.id} code={p.code} name={p.name} isArchived={p.isArchived} canEdit={p.canEdit} canDelete={canDelete} docCount={p.docCount} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination total={total} page={page} pageSize={pageSize} noun="projects" />
    </section>
  );
}
