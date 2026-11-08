"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderKanban, Loader2, MapPin, Search, Tags } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";

type Results = {
  projects: { id: string; code: string; name: string; location: string; managerName: string | null; status: string }[];
  documents: { id: string; title: string; projectCode: string; category: string }[];
  categories: { id: string; name: string; count: number }[];
  locations: { name: string; count: number }[];
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (r.ok) setRes(await r.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const longEnough = q.trim().length >= 2;
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const empty = longEnough && res && !res.projects.length && !res.documents.length && !res.categories.length && !res.locations.length;

  return (
    <>
      <Button variant="outline" className="h-9 w-full max-w-md justify-start gap-2 text-muted-foreground shadow-none" onClick={() => setOpen(true)} aria-label="Search">
        <Search className="size-4" />
        <span className="flex-1 truncate text-left font-normal">Search projects, documents…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQ(""); setRes(null); } }} title="Global search" description="Search projects, locations, managers, documents and categories" className="sm:max-w-xl">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search by project, code, location, manager, document…" />
          <CommandList className="max-h-96">
            {loading && <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Searching…</div>}
            {!loading && !longEnough && <div className="px-3 py-6 text-center text-sm text-muted-foreground">Type at least 2 characters. Results only include records you can access.</div>}
            {!loading && empty && <CommandEmpty>No results for “{q}”.</CommandEmpty>}
            {longEnough && res && res.projects.length > 0 && (
              <CommandGroup heading="Projects">
                {res.projects.map((p) => (
                  <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(`/projects/${p.id}`)}>
                    <FolderKanban />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.code} · {p.location}{p.managerName ? ` · ${p.managerName}` : ""}</div>
                    </div>
                    <StatusBadge status={p.status} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {longEnough && res && res.documents.length > 0 && (
              <CommandGroup heading="Documents">
                {res.documents.map((d) => (
                  <CommandItem key={d.id} value={`d-${d.id}`} onSelect={() => go(`/documents/${d.id}`)}>
                    <FileText />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{d.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{d.projectCode} · {d.category}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {longEnough && res && res.locations.length > 0 && (
              <CommandGroup heading="Locations">
                {res.locations.map((l) => (
                  <CommandItem key={l.name} value={`l-${l.name}`} onSelect={() => go(`/projects?loc=${encodeURIComponent(l.name)}`)}>
                    <MapPin /> {l.name} <span className="ml-auto text-xs text-muted-foreground">{l.count} projects</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {longEnough && res && res.categories.length > 0 && (
              <CommandGroup heading="Document categories">
                {res.categories.map((c) => (
                  <CommandItem key={c.id} value={`c-${c.id}`} onSelect={() => go(`/documents?category=${c.id}`)}>
                    <Tags /> {c.name} <span className="ml-auto text-xs text-muted-foreground">{c.count} documents</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
