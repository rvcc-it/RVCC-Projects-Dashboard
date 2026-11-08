"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { NativeSelect } from "@/components/common/native-select";
import { formatBytes } from "@/lib/format";
import { isPdfFile, uploadWithProgress } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Item = { id: string; file: File; title: string; status: "queued" | "uploading" | "done" | "error"; progress: number; error?: string };
export type ProjectOpt = { id: string; code: string; name: string; canUpload: boolean };
export type CategoryOpt = { id: string; name: string };

export function UploadDialog({
  projects, categories, maxUploadMb, defaultProjectId, label = "Upload documents", variant = "default",
}: { projects: ProjectOpt[]; categories: CategoryOpt[]; maxUploadMb: number; defaultProjectId?: string; label?: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const allowed = projects.filter((p) => p.canUpload);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [projectId, setProjectId] = useState(defaultProjectId && allowed.some((p) => p.id === defaultProjectId) ? defaultProjectId : (allowed[0]?.id ?? ""));
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [revisionLabel, setRevisionLabel] = useState("0");
  const [documentDate, setDocumentDate] = useState("");
  const [description, setDescription] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const add = useCallback(
    (list: FileList | File[]) => {
      const next: Item[] = [];
      for (const f of Array.from(list)) {
        if (!isPdfFile(f)) { toast.error(`"${f.name}" skipped – only PDF files are allowed.`); continue; }
        if (f.size > maxUploadMb * 1024 * 1024) { toast.error(`"${f.name}" skipped – larger than ${maxUploadMb} MB.`); continue; }
        if (f.size === 0) { toast.error(`"${f.name}" skipped – the file is empty.`); continue; }
        next.push({ id: crypto.randomUUID(), file: f, title: f.name.replace(/\.pdf$/i, "").replace(/[_]+/g, " "), status: "queued", progress: 0 });
      }
      setItems((cur) => [...cur, ...next]);
    },
    [maxUploadMb],
  );

  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const pending = items.filter((i) => i.status === "queued" || i.status === "error");

  async function start() {
    if (!projectId) return toast.error("Select a project.");
    if (!categoryId) return toast.error("Select a category.");
    setBusy(true);
    let ok = 0;
    let failed = 0;
    for (const it of pending) {
      patch(it.id, { status: "uploading", progress: 0, error: undefined });
      const fd = new FormData();
      fd.append("file", it.file);
      fd.append("projectId", projectId);
      fd.append("title", it.title);
      fd.append("categoryId", categoryId);
      fd.append("description", description);
      fd.append("revisionLabel", revisionLabel);
      fd.append("documentDate", documentDate);
      const r = await uploadWithProgress("/api/documents", fd, (pct) => patch(it.id, { progress: pct }));
      if (r.ok) { patch(it.id, { status: "done", progress: 100 }); ok++; }
      else { patch(it.id, { status: "error", error: r.error }); failed++; }
    }
    setBusy(false);
    if (ok) { toast.success(`${ok} document${ok > 1 ? "s" : ""} uploaded`); router.refresh(); }
    if (failed) toast.error(`${failed} upload${failed > 1 ? "s" : ""} failed – see details in the list.`);
    if (ok && !failed) { setOpen(false); setItems([]); }
  }

  if (allowed.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) setItems([]); } }}>
      <DialogTrigger render={<Button variant={variant} />}><Upload /> {label}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload PDF documents</DialogTitle>
          <DialogDescription>Files are stored privately and validated on the server (PDF only, up to {maxUploadMb} MB each).</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={cn("flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors", drag ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/40")}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          aria-label="Drop PDF files here or browse"
        >
          <FileUp className="size-8 text-primary" />
          <p className="text-sm font-medium">Drag &amp; drop PDFs here, or <span className="text-primary underline">browse</span></p>
          <p className="text-xs text-muted-foreground">Multiple files supported</p>
          <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
        </div>

        {items.length > 0 && (
          <ul className="grid gap-2" aria-label="Files to upload">
            {items.map((it) => (
              <li key={it.id} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  {it.status === "done" ? <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> : it.status === "error" ? <XCircle className="size-4 shrink-0 text-destructive" /> : it.status === "uploading" ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : <FileUp className="size-4 shrink-0 text-muted-foreground" />}
                  <Input value={it.title} onChange={(e) => patch(it.id, { title: e.target.value })} disabled={busy || it.status === "done"} className="h-7 flex-1" aria-label="Document title" />
                  <span className="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">{formatBytes(it.file.size)}</span>
                  {!busy && it.status !== "done" && (
                    <Button variant="ghost" size="icon-xs" onClick={() => setItems((c) => c.filter((x) => x.id !== it.id))} aria-label={`Remove ${it.file.name}`}><Trash2 /></Button>
                  )}
                </div>
                {(it.status === "uploading" || it.status === "done") && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className={cn("h-full transition-all", it.status === "done" ? "bg-emerald-500" : "bg-primary")} style={{ width: `${it.progress}%` }} />
                  </div>
                )}
                {it.error && <p role="alert" className="mt-1.5 text-xs text-destructive">{it.error}</p>}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project" required>
            <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={busy} aria-label="Project">
              {allowed.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Category" required>
            <NativeSelect value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy} aria-label="Category">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Revision">
            <Input value={revisionLabel} onChange={(e) => setRevisionLabel(e.target.value)} maxLength={30} disabled={busy} placeholder="e.g. 0, A, B" />
          </Field>
          <Field label="Document date">
            <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} disabled={busy} />
          </Field>
          <Field label="Description (applies to all files)" className="sm:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} disabled={busy} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Close</Button>
          <Button onClick={start} disabled={busy || pending.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload {pending.length > 0 ? `${pending.length} file${pending.length > 1 ? "s" : ""}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
