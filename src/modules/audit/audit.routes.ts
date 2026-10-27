// GET /api/audit: etkinlik kaydı (`audit.view`), yeni→eski, sayfa başı 100.
import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest } from "../../shared/http";
import { requirePermission } from "../auth/auth.middleware";

const PAGE_SIZE = 100;

export const createAuditRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>().get("/", requirePermission("audit.view"), (c) => {
    const where: string[] = [];
    const params: (string | number)[] = [];
    const before = c.req.query("before");
    const userId = c.req.query("userId");
    const action = c.req.query("action");
    if (before !== undefined) {
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
    const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const entries = deps.db
      .query<Record<string, unknown>, (string | number)[]>(
        `SELECT * FROM audit_log ${filter} ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
      )
      .all(...params);
    return c.json({ entries });
  });
