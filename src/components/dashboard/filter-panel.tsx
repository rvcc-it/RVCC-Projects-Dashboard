"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, Filter, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/dashboard/multi-select";
import { DateRange } from "@/components/dashboard/date-range";
import { useUrlState } from "@/hooks/use-url-state";
import { activeFilterCount, filtersToParams, parseFilters } from "@/lib/filters";
import { PROJECT_STATUSES, STATUS_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { saveFilterAction, deleteSavedFilterAction } from "@/actions/filters";
import type { FilterOptions } from "@/server/services/projects";
import type { SavedFilter } from "@/server/services/saved-filters";

type Chip = { key: string; value: string; text: string };

export function FilterPanel({
  options, saved, canSave, scope = "dashboard", showArchive,
}: { options: FilterOptions; saved: SavedFilter[]; canSave: boolean; scope?: "dashboard" | "projects" | "reports"; showArchive?: boolean }) {
  const { update, params, pending } = useUrlState();
  const router = useRouter();
  const f = parseFilters(params);
  const count = activeFilterCount(f);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, startSave] = useTransition();
  const mgrName = (id: string) => options.managers.find((m) => m.id === id)?.name ?? "Unknown";

  const chips: Chip[] = [
    ...f.names.map((v) => ({ key: "name", value: v, text: `Project: ${v}` })),
    ...f.codes.map((v) => ({ key: "code", value: v, text: `Code: ${v}` })),
    ...f.locations.map((v) => ({ key: "loc", value: v, text: `Location: ${v}` })),
    ...f.managers.map((v) => ({ key: "pm", value: v, text: `Manager: ${mgrName(v)}` })),
    ...f.clients.map((v) => ({ key: "client", value: v, text: `Client: ${v}` })),
    ...f.statuses.map((v) => ({ key: "status", value: v, text: `Status: ${STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v}` })),
    ...f.categories.map((v) => ({ key: "cat", value: v, text: `Category: ${v}` })),
  ];
  const removeChip = (c: Chip) => update({ [c.key]: params.getAll(c.key).filter((x) => x !== c.value) });
  const setList = (key: string) => (v: string[]) => update({ [key]: v });
  const clearAll = () =>
    update(Object.fromEntries(["name", "code", "loc", "pm", "client", "status", "cat", "sf", "st", "ef", "et", "q"].map((k) => [k, null])));

  function save() {
    startSave(async () => {
      const r = await saveFilterAction(name, filtersToParams(f).toString(), scope);
      if (r.ok) {
        toast.success("Filter set saved");
        setSaveOpen(false);
        setName("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <section className="relative mb-6 overflow-hidden rounded-xl border bg-card shadow-card" aria-label="Project filters">
      {pending && <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" />}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="size-4 text-primary" /> Filters
          {count > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{count}</span>}
          {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showArchive && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <select
                value={f.archived}
                onChange={(e) => update({ archived: e.target.value === "exclude" ? null : e.target.value })}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none"
                aria-label="Archived projects"
              >
                <option value="exclude">Hide archived</option>
                <option value="include">Include archived</option>
                <option value="only">Archived only</option>
              </select>
            </label>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <Bookmark /> Saved filters
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Saved filter sets</DropdownMenuLabel>
              </DropdownMenuGroup>
              {saved.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Nothing saved yet. Apply some filters and choose “Save current filters”.</p>}
              {saved.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => router.replace(`${scope === "projects" ? "/projects" : scope === "reports" ? "/reports" : "/"}?${s.query}`)} className="justify-between">
                  <span className="truncate">{s.name}</span>
                  <button
                    type="button"
                    aria-label={`Delete saved filter ${s.name}`}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const r = await deleteSavedFilterAction(s.id);
                      if (r.ok) { toast.success("Saved filter deleted"); router.refresh(); } else toast.error(r.error);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              ))}
              {canSave && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={count === 0} onClick={() => setSaveOpen(true)}>
                    <BookmarkPlus /> Save current filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" disabled={count === 0} onClick={clearAll}>
            <X /> Clear all
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <MultiSelect label="Project name" options={options.names.map((v) => ({ value: v, label: v }))} selected={f.names} onChange={setList("name")} />
        <MultiSelect label="Project code" options={options.codes.map((v) => ({ value: v, label: v }))} selected={f.codes} onChange={setList("code")} />
        <MultiSelect label="Location" options={options.locations.map((v) => ({ value: v, label: v }))} selected={f.locations} onChange={setList("loc")} />
        <MultiSelect label="Project manager" options={options.managers.map((m) => ({ value: m.id, label: m.name }))} selected={f.managers} onChange={setList("pm")} />
        <MultiSelect label="Client" options={options.clients.map((v) => ({ value: v, label: v }))} selected={f.clients} onChange={setList("client")} />
        <MultiSelect label="Status" options={PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} selected={f.statuses} onChange={setList("status")} />
        <MultiSelect label="Category" options={options.categories.map((v) => ({ value: v, label: v }))} selected={f.categories} onChange={setList("cat")} />
        <DateRange label="Start date" from={f.startFrom} to={f.startTo} onChange={(a, b) => update({ sf: a || null, st: b || null })} />
        <DateRange label="End date" from={f.endFrom} to={f.endTo} onChange={(a, b) => update({ ef: a || null, et: b || null })} />
      </div>

      {(chips.length > 0 || f.startFrom || f.startTo || f.endFrom || f.endTo || f.q) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/30 px-4 py-2.5" aria-label="Active filters">
          {f.q && <Chip text={`Search: “${f.q}”`} onRemove={() => update({ q: null })} />}
          {chips.map((c) => (
            <Chip key={c.key + c.value} text={c.text} onRemove={() => removeChip(c)} />
          ))}
          {(f.startFrom || f.startTo) && <Chip text={`Start: ${f.startFrom ? formatDate(f.startFrom) : "…"} → ${f.startTo ? formatDate(f.startTo) : "…"}`} onRemove={() => update({ sf: null, st: null })} />}
          {(f.endFrom || f.endTo) && <Chip text={`End: ${f.endFrom ? formatDate(f.endFrom) : "…"} → ${f.endTo ? formatDate(f.endTo) : "…"}`} onRemove={() => update({ ef: null, et: null })} />}
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current filters</DialogTitle>
            <DialogDescription>Give this combination a name to reuse it later.</DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riyadh – active projects" maxLength={60} autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 2 && save()} aria-label="Filter set name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || name.trim().length < 2}>
              {saving && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Chip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pr-1 pl-2.5 text-xs">
      <span className="truncate">{text}</span>
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove filter ${text}`}>
        <X className="size-3" />
      </button>
    </span>
  );
}
