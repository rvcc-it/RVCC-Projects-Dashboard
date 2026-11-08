// Copies the pdf.js worker into /public so the PDF viewer can load it (the worker contains no confidential data).
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
if (fs.existsSync(src)) {
  fs.mkdirSync("public", { recursive: true });
  fs.copyFileSync(src, path.resolve("public/pdf.worker.min.mjs"));
}
