// CSV üretimi. Türkçe Excel için: UTF-8 BOM ve ";" ayırıcı.
// Formül enjeksiyonuna karşı = + - @ ile başlayan hücrelerin başına ' konur.
import type { Context } from "hono";

const cell = (value: unknown): string => {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (header: string[], rows: unknown[][]): string =>
  `﻿${[header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;

// "2026-10-27 14:05" (sunucu saat dilimi)
export const formatTs = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const csvResponse = (c: Context, filename: string, body: string) =>
  c.body(body, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
    "Cache-Control": "no-store",
  });
