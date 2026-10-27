// Giriş, çıkış, "ben kimim" ve ekranına geçme.
import { hashPassword, verifyPassword } from "@mustafakurtt/hono-core/auth";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { HttpFailure, badRequest, forbidden, notFound, readJson } from "../../shared/http";
import { audit } from "../audit/audit.log";
import {
  asImpersonated,
  canImpersonate,
  endSession,
  findSessionUser,
  requireUser,
  startSession,
} from "./auth.middleware";

const loginSchema = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) });

// Kullanıcı adı başına: art arda 5 hatalı denemede 5 dakika kilit.
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;
const impersonateSchema = z.object({ userId: z.number().int().positive() });

export const createAuthRoutes = (deps: AppDeps) => {
  const { db } = deps;
  const failures = new Map<string, { count: number; until: number }>();
  // Var olmayan kullanıcıda da şifre doğrulaması yapılır: yanıt süresi kullanıcının varlığını ele vermesin.
  const dummyHash = hashPassword("biga-panel-yok-kullanici");

  return new Hono<AppEnv>()
    .post("/login", async (c) => {
      const parsed = loginSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Kullanıcı adı ve şifre gerekli");
      const key = parsed.data.username.toLowerCase();
      const lock = failures.get(key);
      if (lock && lock.until > Date.now()) {
        throw new HttpFailure(429, "Çok fazla hatalı deneme. 5 dakika sonra tekrar deneyin.");
      }
      const row = db
        .query<{ id: number; name: string; password_hash: string; active: number }, [string]>(
          "SELECT id, name, password_hash, active FROM users WHERE username = ?",
        )
        .get(parsed.data.username);
      const ok = await verifyPassword(parsed.data.password, row?.password_hash ?? (await dummyHash));
      if (!row || !ok) {
        // Süresi dolmuş kilit sayacı sıfırlar; yoksa denemeler birikir.
        const expired = lock !== undefined && lock.until > 0 && lock.until <= Date.now();
        const count = (lock && !expired ? lock.count : 0) + 1;
        failures.set(key, { count, until: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
        deps.audit.record({ actor: null, action: "auth.login_failed", target: parsed.data.username.slice(0, 40) });
        throw new HttpFailure(401, "Kullanıcı adı veya şifre hatalı");
      }
      failures.delete(key);
      if (!row.active) throw forbidden("Hesabınız devre dışı. Yöneticinize başvurun.");
      db.query("UPDATE users SET last_login_at = ? WHERE id = ?").run(Date.now(), row.id);
      await startSession(deps, c, row.id);
      const user = findSessionUser(db, row.id)!;
      deps.audit.record({ actor: user, action: "auth.login" });
      return c.json({ user, actor: null });
    })
    .post("/logout", requireUser(deps), (c) => {
      audit(c, deps, "auth.logout");
      endSession(c);
      return c.json({ ok: true });
    })
    .get("/me", requireUser(deps), (c) => c.json({ user: c.get("user"), actor: c.get("actor") }))
    .get("/impersonate/targets", requireUser(deps), (c) => {
      const actor = c.get("actor") ?? c.get("user");
      if (!actor.permissions.includes("impersonate.view")) throw forbidden();
      const users = db
        .query<{ id: number }, []>("SELECT id FROM users WHERE active = 1 ORDER BY name")
        .all()
        .map((r) => findSessionUser(db, r.id))
        .filter((u) => u !== null && canImpersonate(actor, u))
        .map((u) => ({ id: u!.id, username: u!.username, name: u!.name, roleName: u!.roleName }));
      return c.json({ users });
    })
    .post("/impersonate", requireUser(deps), async (c) => {
      // Zaten birinin ekranındaysa geçişi gerçek kişi adına yapar (iç içe geçiş yok).
      const actor = c.get("actor") ?? c.get("user");
      if (!actor.permissions.includes("impersonate.view")) throw forbidden();
      const parsed = impersonateSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Kullanıcı seçin");
      const target = findSessionUser(db, parsed.data.userId);
      if (!target) throw notFound("Kullanıcı bulunamadı ya da devre dışı");
      if (!canImpersonate(actor, target)) throw forbidden("Bu kullanıcının ekranına geçemezsiniz");
      await startSession(deps, c, actor.id, target.id);
      const user = asImpersonated(target, actor);
      const mode = user.permissions.includes("messages.send") ? "gönderebilir" : "izleme";
      deps.audit.record({ actor, asUser: target, action: "impersonate.start", target: target.name, detail: mode });
      return c.json({ user, actor });
    })
    .post("/impersonate/stop", requireUser(deps), async (c) => {
      const actor = c.get("actor");
      if (!actor) throw badRequest("Şu an kimsenin ekranında değilsiniz");
      await startSession(deps, c, actor.id);
      deps.audit.record({ actor, asUser: c.get("user"), action: "impersonate.stop", target: c.get("user").name });
      return c.json({ user: actor, actor: null });
    });
};
