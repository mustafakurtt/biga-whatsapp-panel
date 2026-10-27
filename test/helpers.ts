// Test kurulumu: bellek içi veritabanı + mock WhatsApp sağlayıcısı + çerez saklayan istemci.
import { hashPassword } from "@mustafakurtt/hono-core/auth";
import { createLogger } from "@mustafakurtt/hono-core/logger";
import { expect } from "bun:test";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";
import { openDatabase } from "../src/db/client";
import { createAuditLog } from "../src/modules/audit/audit.log";
import { createLiveHub } from "../src/modules/events/events.hub";
import { createMessageService } from "../src/modules/messages/messages.service";
import { type NumberGrant, createUsersRepository } from "../src/modules/users/users.repository";
import { createMockProvider } from "../src/providers/mock.provider";
import type { Notifier } from "../src/shared/contracts";

export const ROLE = { patron: 1, temsilci: 2, salt_okunur: 3 } as const;
export const PASSWORD = "secret1";

export const setup = () => {
  const env = parseEnv({ JWT_SECRET: "x".repeat(32), PROVIDER: "mock", DATABASE_PATH: ":memory:" });
  const logger = createLogger({ level: "silent" });
  const db = openDatabase(":memory:");
  const hub = createLiveHub(db);
  const pushes: { numberId: number; title: string; body: string; except?: number }[] = [];
  const notifier: Notifier = {
    publicKey: "",
    async notifyNumber(numberId, payload, except) {
      pushes.push({ numberId, title: payload.title, body: payload.body, except });
    },
  };
  const messages = createMessageService({ db, hub, notifier, logger });
  const provider = createMockProvider({ onEvent: (e) => void messages.handleInbound(e), connectDelayMs: 0 });
  const app = createApp({ env, db, logger, provider, hub, notifier, messages, audit: createAuditLog(db) });
  const users = createUsersRepository(db);

  const addUser = async (username: string, roleId: number, numbers: NumberGrant[] = []) =>
    users.create({ username, name: username.toUpperCase(), passwordHash: await hashPassword(PASSWORD), roleId, active: true, numbers });

  // Giriş yapar, çerezi saklar; impersonate gibi çerez yenileyen yanıtlarda çerezi günceller.
  const login = async (username: string) => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    let cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    return async (method: string, path: string, body?: unknown) => {
      const r = await app.request(path, {
        method,
        headers: { cookie, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const next = r.headers.get("set-cookie");
      if (next) cookie = next.split(";")[0]!;
      // biome-ignore lint: test yardımcısı
      return { status: r.status, json: (await r.json().catch(() => null)) as any };
    };
  };

  // Bağlı bir mock numara ekler.
  const addNumber = async (api: Awaited<ReturnType<typeof login>>, label: string, phone: string): Promise<number> => {
    const created = await api("POST", "/api/numbers", { label, phone });
    expect(created.status).toBe(200);
    const id = created.json.number.id as number;
    await api("POST", `/api/numbers/${id}/pair`);
    await new Promise((r) => setTimeout(r, 5));
    return id;
  };

  const inbound = (api: Awaited<ReturnType<typeof login>>, numberId: number, from: string, name: string, text: string) =>
    api("POST", "/api/dev/inbound", { numberId, from, name, text });

  return { app, db, hub, pushes, users, addUser, login, addNumber, inbound };
};

export type TestContext = ReturnType<typeof setup>;
export type Api = Awaited<ReturnType<TestContext["login"]>>;
