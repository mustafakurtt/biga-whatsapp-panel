// GET /api/reports/summary?days=7: görülebilir numaralarda mesaj sayıları (`reports.view`).
import { Hono } from "hono";
import { visibleNumberIds } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest } from "../../shared/http";
import { requirePermission } from "../auth/auth.middleware";

const DAY_MS = 24 * 60 * 60 * 1000;

// Sunucunun saat dilimiyle YYYY-MM-DD.
const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Row = { ts: number; direction: "in" | "out"; source: string; sent_by: number | null; number_id: number; chat_id: number };

const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(",") || "NULL";

export const createReportsRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>().get("/summary", requirePermission("reports.view"), (c) => {
    const days = Number(c.req.query("days") ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw badRequest("Gün sayısı 1 ile 90 arasında olmalı");

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const since = start.getTime() - (days - 1) * DAY_MS;
    const ids = visibleNumberIds(deps.db, c.get("user"));
    const marks = placeholders(ids.length);
    const rows = deps.db
      .query<Row, number[]>(
        `SELECT m.ts, m.direction, m.source, m.sent_by, c.number_id, m.chat_id FROM messages m
         JOIN chats c ON c.id = m.chat_id WHERE m.ts >= ? AND c.number_id IN (${marks})`,
      )
      .all(since, ...ids);

    const daily = new Map<string, { day: string; incoming: number; outgoing: number }>();
    for (let i = 0; i < days; i++) {
      const day = dayKey(since + i * DAY_MS + DAY_MS / 2); // gün ortası: yaz saati kaymasına karşı
      daily.set(day, { day, incoming: 0, outgoing: 0 });
    }
    const numbers = deps.db
      .query<{ id: number; label: string }, number[]>(`SELECT id, label FROM numbers WHERE id IN (${marks}) ORDER BY label`)
      .all(...ids);
    const perNumber = new Map(numbers.map((n) => [n.id, { numberId: n.id, label: n.label, incoming: 0, outgoing: 0 }]));
    const perUser = new Map<number, number>();
    const totals = { incoming: 0, outgoing: 0, panel: 0, phone: 0, chats: 0 };
    const chatIds = new Set<number>();

    for (const r of rows) {
      const key = r.direction === "in" ? "incoming" : "outgoing";
      const bucket = daily.get(dayKey(r.ts));
      if (bucket) bucket[key]++;
      const n = perNumber.get(r.number_id);
      if (n) n[key]++;
      totals[key]++;
      if (r.source === "panel") totals.panel++;
      if (r.source === "phone") totals.phone++;
      if (r.sent_by !== null) perUser.set(r.sent_by, (perUser.get(r.sent_by) ?? 0) + 1);
      chatIds.add(r.chat_id);
    }
    totals.chats = chatIds.size;

    const userIds = [...perUser.keys()];
    const names = new Map(
      deps.db
        .query<{ id: number; name: string }, number[]>(`SELECT id, name FROM users WHERE id IN (${placeholders(userIds.length)})`)
        .all(...userIds)
        .map((u) => [u.id, u.name]),
    );

    return c.json({
      days,
      totals,
      daily: [...daily.values()],
      perNumber: [...perNumber.values()],
      perUser: [...perUser]
        .map(([userId, sent]) => ({ userId, name: names.get(userId) ?? "Silinmiş kullanıcı", sent }))
        .sort((a, b) => b.sent - a.sent),
    });
  });
