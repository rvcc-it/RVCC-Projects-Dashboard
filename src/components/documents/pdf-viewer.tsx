"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

// The worker file is a static copy of pdfjs-dist's worker (scripts/copy-pdf-worker.mjs) – it contains no confidential data.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/**
 * Embedded viewer. The PDF is fetched from the authenticated /api/documents/:id/file route with the user's
 * session cookie – there is no public URL and nothing is cached by the browser (Cache-Control: private, no-store).
 */
export default function PdfViewer({
  docId, revision, canDownload, largeHref, height = 640,
}: { docId: string; revision?: number; canDownload: boolean; largeHref?: string; height?: number | string }) {
  const src = `/api/documents/${docId}/file${revision ? `?rev=${revision}` : ""}`;
  const downloadHref = `/api/documents/${docId}/file?download=1${revision ? `&rev=${revision}` : ""}`;
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width - 32))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const [lastSrc, setLastSrc] = useState(src);
  if (lastSrc !== src) {
    // new revision selected: reset navigation state (adjusted during render rather than in an effect)
    setLastSrc(src);
    setPage(1);
    setError(null);
  }

  const go = useCallback((p: number) => setPage(Math.min(Math.max(1, p), pages || 1)), [pages]);
  const file = { url: src, withCredentials: true };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-card" style={{ height }}>
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft /></Button>
          <input
            aria-label="Page number"
            className="h-7 w-12 rounded-md border bg-background text-center text-sm tabular-nums"
            value={page}
            onChange={(e) => go(parseInt(e.target.value, 10) || 1)}
            inputMode="numeric"
          />
          <span className="text-sm text-muted-foreground">/ {pages || "–"}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight /></Button>
        </div>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} aria-label="Zoom out"><ZoomOut /></Button>
          <button type="button" className="w-12 rounded text-center text-sm tabular-nums hover:bg-muted" onClick={() => setScale(1)} title="Reset zoom">{Math.round(scale * 100)}%</button>
          <Button variant="ghost" size="icon-sm" onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))} aria-label="Zoom in"><ZoomIn /></Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setScale(1)} aria-label="Fit to width"><Maximize2 /></Button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {largeHref && (
            <Link href={largeHref}><Button variant="outline" size="sm"><ExternalLink /> Larger viewer</Button></Link>
          )}
          {canDownload && (
            <a href={downloadHref}><Button variant="outline" size="sm"><Download /> Download</Button></a>
          )}
        </div>
      </div>
      <div ref={wrap} className="flex-1 overflow-auto bg-muted/60 p-4">
        {error ? (
          <p role="alert" className="py-16 text-center text-sm text-destructive">{error}</p>
        ) : (
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            onLoadError={() => setError("This document could not be loaded. You may no longer have access, or the file is damaged.")}
            loading={<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading document…</div>}
            className="flex justify-center"
          >
            <Page pageNumber={page} width={width} scale={scale} className="overflow-hidden rounded-sm shadow-lg" renderTextLayer renderAnnotationLayer={false} />
          </Document>
        )}
      </div>
    </div>
  );
}
