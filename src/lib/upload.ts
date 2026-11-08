// Browser helper: multipart upload with progress (fetch cannot report upload progress, XHR can).
export type UploadResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function uploadWithProgress(url: string, form: FormData, onProgress: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as Record<string, unknown>;
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true, data: body });
      else resolve({ ok: false, error: String(body.error ?? `Upload failed (${xhr.status})`), fieldErrors: body.fieldErrors as Record<string, string> | undefined });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error – the upload was interrupted." });
    xhr.onabort = () => resolve({ ok: false, error: "Upload cancelled." });
    xhr.send(form);
  });
}

export function isPdfFile(f: File) {
  return /\.pdf$/i.test(f.name) && (f.type === "application/pdf" || f.type === "");
}
