import "server-only";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import type { ReportResult, ColType } from "@/server/services/reports";

type Cell = string | number | null;

function display(v: Cell, t: ColType): string {
  if (v === null || v === undefined || v === "") return "";
  switch (t) {
    case "date": return formatDate(String(v));
    case "datetime": return formatDateTime(String(v));
    case "bytes": return formatBytes(Number(v));
    case "percent": return `${v}%`;
    default: return String(v);
  }
}

// Neutralise spreadsheet formula injection in exported text cells.
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

export function toCsv(r: ReportResult): Buffer {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [r.columns.map((c) => esc(c.label)).join(",")];
  for (const row of r.rows)
    lines.push(r.columns.map((c) => esc(safe(display(row[c.key] as Cell, c.type)))).join(","));
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

export async function toXlsx(r: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RVCC Projects Portal";
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 30));
  ws.addRow([r.title]).font = { bold: true, size: 14 };
  ws.addRow([`Generated ${formatDateTime(r.generatedAt)}${r.truncated ? " (truncated to first 5,000 rows)" : ""}`]).font = { italic: true, color: { argb: "FF64748B" } };
  ws.addRow([]);
  const head = ws.addRow(r.columns.map((c) => c.label));
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }));
  for (const row of r.rows) {
    ws.addRow(
      r.columns.map((c) => {
        const v = row[c.key] as Cell;
        if (v === null || v === undefined) return "";
        if (c.type === "number" || c.type === "percent") return Number(v);
        if (c.type === "bytes") return Number(v);
        if (c.type === "date") return new Date(String(v) + "T00:00:00");
        if (c.type === "datetime") return new Date(String(v));
        return safe(String(v));
      }),
    );
  }
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(48, Math.max(12, c.label.length + 4, ...r.rows.slice(0, 200).map((x) => display(x[c.key] as Cell, c.type).length + 2)));
    if (c.type === "date") col.numFmt = "dd-mmm-yyyy";
    if (c.type === "datetime") col.numFmt = "dd-mmm-yyyy hh:mm";
    if (c.type === "percent") col.numFmt = '0"%"';
    if (c.type === "bytes") col.numFmt = "#,##0";
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: r.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(r: ReportResult): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text(r.title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated ${formatDateTime(r.generatedAt)}  ·  ${r.rows.length} row(s)${r.truncated ? " (truncated)" : ""}`, 40, 56);
  autoTable(doc, {
    startY: 70,
    head: [r.columns.map((c) => c.label)],
    body: r.rows.map((row) => r.columns.map((c) => display(row[c.key] as Cell, c.type))),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const n = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(`Page ${n}`, doc.internal.pageSize.getWidth() - 70, doc.internal.pageSize.getHeight() - 20);
    },
  });
  return Buffer.from(doc.output("arraybuffer"));
}
