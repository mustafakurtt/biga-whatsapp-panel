// GET /api/audit: etkinlik kaydı (`audit.view`), yeni→eski, sayfa başı 100.
// GET /api/audit/export: aynı filtrelerle CSV (`audit.view` + `data.export`), en fazla 10.000 kayıt.
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { csvResponse, formatTs, toCsv } from "../../shared/csv";
import { badRequest } from "../../shared/http";
import { audit } from "./audit.log";
import { requirePermission } from "../auth/auth.middleware";

const PAGE_SIZE = 100;
const EXPORT_LIMIT = 10_000;

type Entry = {
  id: number;
  ts: number;
  actor_id: number | null;
  actor_name: string | null;
  as_user_id: number | null;
  as_user_name: string | null;
  action: string;
  target: string;
  detail: string | null;
};

const filters = (query: (k: string) => string | undefined, withBefore: boolean) => {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const before = query("before");
  const userId = query("userId");
  const action = query("action");
  if (withBefore && before !== undefined) {
    if (!/^\d+$/.test(before)) throw badRequest("Geçersiz 'before' değeri");
    where.push("id < ?");
    params.push(Number(before));
  }
  if (userId) {
    if (!/^\d+$/.test(userId)) throw badRequest("Geçersiz kullanıcı");
    // Kişinin kendi yaptıkları ve onun ekranında yapılanlar.
    where.push("(actor_id = ? OR as_user_id = ?)");
    params.push(Number(userId), Number(userId));
  }
  if (action) {
    where.push("action = ?");
    params.push(action.slice(0, 40));
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
};

export const createAuditRoutes = (deps: AppDeps) => {
  const select = (where: { sql: string; params: (string | number)[] }, limit: number) =>
    deps.db
      .query<Entry, (string | number)[]>(`SELECT * FROM audit_log ${where.sql} ORDER BY id DESC LIMIT ${limit}`)
      .all(...where.params);

  return new Hono<AppEnv>()
    .use(requirePermission("audit.view"))
    .get("/", (c) => c.json({ entries: select(filters((k) => c.req.query(k), true), PAGE_SIZE) }))
    .get("/export", requirePermission("data.export"), (c) => {
      const entries = select(filters((k) => c.req.query(k), false), EXPORT_LIMIT);
      audit(c, deps, "audit.export", `${entries.length} kayıt`);
      const rows = entries.map((e) => [formatTs(e.ts), e.actor_name ?? "", e.as_user_name ?? "", e.action, e.target, e.detail ?? ""]);
      return csvResponse(c, "etkinlik-kaydi.csv", toCsv(["Zaman", "Kim", "Kimin adına", "İşlem", "Hedef", "Ayrıntı"], rows));
    });
};
