"use client";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/common/native-select";
import { SearchInput } from "@/components/common/search-input";
import { useUrlState } from "@/hooks/use-url-state";

export function DocumentFilters({
  projects, categories, uploaders, hideProject, canSeeTrash,
}: {
  projects: { id: string; code: string; name: string }[];
  categories: { id: string; name: string }[];
  uploaders: { id: string; name: string }[];
  hideProject?: boolean;
  canSeeTrash?: boolean;
}) {
  const { update, params, pending } = useUrlState();
  const g = (k: string) => params.get(k) ?? "";
  const active = ["q", "project", "category", "uploader", "from", "to"].some((k) => g(k));
  const trash = g("trash") === "1";
  return (
    <div className="flex flex-wrap items-end gap-2 border-b p-3 sm:p-4" aria-busy={pending}>
      <SearchInput placeholder="Search title, project, category, file…" className="w-full sm:w-72" />
      {!hideProject && (
        <NativeSelect className="h-8 w-48" value={g("project")} onChange={(e) => update({ project: e.target.value || null })} aria-label="Filter by project">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
        </NativeSelect>
      )}
      <NativeSelect className="h-8 w-44" value={g("category")} onChange={(e) => update({ category: e.target.value || null })} aria-label="Filter by category">
        <option value="">All categories</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </NativeSelect>
      <NativeSelect className="h-8 w-40" value={g("uploader")} onChange={(e) => update({ uploader: e.target.value || null })} aria-label="Filter by uploader">
        <option value="">Any uploader</option>
        {uploaders.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </NativeSelect>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        From <Input type="date" className="h-8 w-36" value={g("from")} max={g("to") || undefined} onChange={(e) => update({ from: e.target.value || null })} aria-label="Uploaded from" />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        To <Input type="date" className="h-8 w-36" value={g("to")} min={g("from") || undefined} onChange={(e) => update({ to: e.target.value || null })} aria-label="Uploaded to" />
      </label>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => update({ q: null, project: hideProject ? params.get("project") : null, category: null, uploader: null, from: null, to: null })}>
          <X /> Clear
        </Button>
      )}
      {canSeeTrash && (
        <Button variant={trash ? "secondary" : "outline"} size="sm" className="ml-auto" onClick={() => update({ trash: trash ? null : "1" })}>
          <Trash2 /> {trash ? "Hide trash" : "Trash"}
        </Button>
      )}
    </div>
  );
}
