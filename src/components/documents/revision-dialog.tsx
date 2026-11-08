"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/common/form-field";
import { formatBytes } from "@/lib/format";
import { isPdfFile, uploadWithProgress } from "@/lib/upload";

export function RevisionDialog({ docId, title, currentLabel, nextNo, maxUploadMb, open, onOpenChange }: { docId: string; title: string; currentLabel: string; nextNo: number; maxUploadMb: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    if (!isPdfFile(f)) return setError("Only PDF files are allowed.");
    if (f.size > maxUploadMb * 1024 * 1024) return setError(`The file is larger than ${maxUploadMb} MB.`);
    setFile(f);
  }

  async function submit() {
    if (!file) return setError("Choose a PDF file.");
    setProgress(0);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("revisionLabel", label);
    fd.append("notes", notes);
    const r = await uploadWithProgress(`/api/documents/${docId}/revisions`, fd, setProgress);
    setProgress(null);
    if (!r.ok) return setError(r.error);
    toast.success("New revision uploaded. Previous revisions are preserved.");
    setFile(null); setLabel(""); setNotes("");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload new revision</DialogTitle>
          <DialogDescription>
            “{title}” – current revision <b>{currentLabel}</b>. The new file becomes revision #{nextNo}; older files stay available in the history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <button type="button" onClick={() => ref.current?.click()} className="flex items-center gap-3 rounded-lg border-2 border-dashed px-4 py-5 text-left hover:border-primary/50 hover:bg-muted/40" disabled={busy}>
            <FileUp className="size-6 text-primary" />
            <span className="min-w-0 text-sm">
              {file ? <><b className="block truncate">{file.name}</b><span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span></> : "Choose a PDF file…"}
            </span>
          </button>
          <input ref={ref} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <Field label="Revision label" hint={`Leave empty to use ${nextNo - 1}`}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="e.g. B" disabled={busy} />
          </Field>
          <Field label="Revision notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} placeholder="What changed?" disabled={busy} />
          </Field>
          {busy && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !file}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload revision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
