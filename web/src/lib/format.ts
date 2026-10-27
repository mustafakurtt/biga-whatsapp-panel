// Tarih, saat, süre ve numara biçimleri (tr-TR).
import type { ChatRow } from "../api/types";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (ts: number) => (startOfDay(new Date()) - startOfDay(new Date(ts))) / DAY;

export const fmtClock = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** Listelerde: bugün 14:32, dün "Dün", son 6 gün "Pzt", sonra 12.10.2026 */
export function fmtListTime(ts: number | null | undefined): string {
  if (!ts) return "";
  const diff = daysAgo(ts);
  if (diff <= 0) return fmtClock(ts);
  if (diff === 1) return "Dün";
  if (diff < 7) return new Date(ts).toLocaleDateString("tr-TR", { weekday: "short" });
  return new Date(ts).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Mesaj günü ayırıcısı: Bugün / Dün / 12 Ekim Pazartesi / 12 Ekim 2025 */
export function fmtDayLabel(ts: number): string {
  const diff = daysAgo(ts);
  if (diff <= 0) return "Bugün";
  if (diff === 1) return "Dün";
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("tr-TR", sameYear ? { day: "numeric", month: "long", weekday: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

export function fmtFull(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Az önce", "3 dk önce", "2 sa önce", "Dün 14:30", "12.10.2026 09:14" */
export function fmtAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "Az önce";
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  const diff = daysAgo(ts);
  if (diff <= 0) return `${Math.floor(s / 3600)} sa önce`;
  if (diff === 1) return `Dün ${fmtClock(ts)}`;
  return fmtFull(ts);
}

/** 200000 → "3 dk 20 sn" */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} dk ${s % 60} sn` : `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} sa ${m % 60} dk` : `${h} sa`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} gün ${h % 24} sa` : `${d} gün`;
}

export const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export const remoteLabel = (remoteId: string | null | undefined) => String(remoteId ?? "").replace(/@.*$/, "");

/** 905551234567 → +90 555 123 45 67 */
export function fmtPhone(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("90")) return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  if (!d) return String(raw ?? "");
  return `+${d}`;
}

export const chatTitle = (c: Pick<ChatRow, "name" | "remote_id"> | null | undefined) =>
  (c && (c.name || fmtPhone(remoteLabel(c.remote_id)))) || "";

export const nf = new Intl.NumberFormat("tr-TR");

export function initials(name: string | null | undefined): string {
  const parts = String(name ?? "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : first.slice(1);
  return ((first[0] ?? "") + (last[0] ?? "")).toLocaleUpperCase("tr-TR");
}

/** Kişiye sabit renk (0–5): sayı id'den, yoksa addan. */
export function hueIndex(key: number | string | null | undefined): number {
  if (typeof key === "number") return Math.abs(key) % 6;
  const s = String(key ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
}

/** Eşleşmenin çevresinden kısa parça */
export function snippet(text: string, q: string, radius = 48): string {
  const s = String(text ?? "").replace(/\s+/g, " ");
  const needle = q.trim().toLocaleLowerCase("tr-TR");
  const j = s.toLocaleLowerCase("tr-TR").indexOf(needle);
  if (j < 0 || s.length <= radius * 2) return s;
  const start = Math.max(0, j - radius);
  const end = Math.min(s.length, j + needle.length + radius);
  return `${start > 0 ? "…" : ""}${s.slice(start, end)}${end < s.length ? "…" : ""}`;
}

export const lower = (s: string) => s.toLocaleLowerCase("tr-TR");
