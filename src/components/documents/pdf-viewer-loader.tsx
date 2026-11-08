"use client";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// pdf.js needs browser APIs, so the viewer is client-only.
export const PdfViewer = dynamic(() => import("@/components/documents/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center gap-2 rounded-xl border bg-card text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Preparing viewer…
    </div>
  ),
});
