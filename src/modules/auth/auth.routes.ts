// Giriş, çıkış ve "ben kimim".
import { verifyPassword } from "@mustafakurtt/hono-core/auth";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { HttpFailure, badRequest, readJson } from "../../shared/http";
import { endSession, findSessionUser, requireUser, startSession } from "./auth.middleware";

const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });

export const createAuthRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .post("/login", async (c) => {
      const parsed = loginSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Kullanıcı adı ve şifre gerekli");
      const row = deps.db
        .query<{ id: number; password_hash: string }, [string]>("SELECT id, password_hash FROM users WHERE username = ?")
        .get(parsed.data.username);
      const ok = row ? await verifyPassword(parsed.data.password, row.password_hash) : false;
      if (!row || !ok) throw new HttpFailure(401, "Kullanıcı adı veya şifre hatalı");
      await startSession(deps, c, row.id);
      return c.json({ user: findSessionUser(deps, row.id) });
    })
    .post("/logout", (c) => {
      endSession(c);
      return c.json({ ok: true });
    })
    .get("/me", requireUser(deps), (c) => c.json({ user: c.get("user") }));
