// Uçtan uca API testleri: bellek içi veritabanı + mock WhatsApp sağlayıcısı.
import { hashPassword } from "@mustafakurtt/hono-core/auth";
import { createLogger } from "@mustafakurtt/hono-core/logger";
import { beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { parseEnv } from "../src/config/env";
import { openDatabase } from "../src/db/client";
import { createLiveHub } from "../src/modules/events/events.hub";
import { createMessageService } from "../src/modules/messages/messages.service";
import { createUsersRepository } from "../src/modules/users/users.repository";
import { MOCK_PAIRING_CODE, createMockProvider } from "../src/providers/mock.provider";
import type { Notifier } from "../src/shared/contracts";
import type { LiveEvent, Role } from "../src/shared/types";

const setup = async () => {
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
  const app = createApp({ env, db, logger, provider, hub, notifier, messages });

  const users = createUsersRepository(db);
  const addUser = async (username: string, role: Role) =>
    users.create({ username, name: username.toUpperCase(), passwordHash: await hashPassword("secret1"), role, numberIds: [] });

  // Çerezi saklayan küçük istemci.
  const client = async (username: string) => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "secret1" }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    return async (method: string, path: string, body?: unknown) => {
      const r = await app.request(path, {
        method,
        headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, json: (await r.json().catch(() => null)) as any };
    };
  };

  return { app, db, hub, pushes, users, addUser, client };
};

let t: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  t = await setup();
});

const tick = () => new Promise((r) => setTimeout(r, 10));

describe("giriş", () => {
  test("yanlış şifre 401, doğru şifre çerez ve kullanıcı döner", async () => {
    await t.addUser("patron", "patron");
    const bad = await t.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "patron", password: "yanlis" }),
    });
    expect(bad.status).toBe(401);
    const api = await t.client("patron");
    const me = await api("GET", "/api/auth/me");
    expect(me.json.user).toMatchObject({ username: "patron", role: "patron" });
  });

  test("çerezsiz istek 401", async () => {
    const res = await t.app.request("/api/numbers");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Oturum açmanız gerekiyor" });
  });
});

describe("numaralar ve mesajlar", () => {
  test("numara ekle, eşleştir, gelen ve giden mesaj, roller", async () => {
    await t.addUser("patron", "patron");
    const temsilciId = await t.addUser("ali", "temsilci");
    const okurId = await t.addUser("veli", "salt_okunur");
    await t.addUser("baska", "temsilci");
    const patron = await t.client("patron");

    // Numara ekle (telefon normalize edilir) ve eşleştir.
    const created = await patron("POST", "/api/numbers", { label: "Satış", phone: "0555 111 22 33" });
    expect(created.status).toBe(200);
    expect(created.json.number).toMatchObject({ label: "Satış", phone: "905551112233", status: "SCAN_QR_CODE" });
    const numberId = created.json.number.id as number;
    expect((await patron("POST", "/api/numbers", { label: "Tekrar", phone: "+90 555 111 22 33" })).status).toBe(400);

    const pair = await patron("POST", `/api/numbers/${numberId}/pair`);
    expect(pair.json).toEqual({ code: MOCK_PAIRING_CODE });
    await tick();
    const list = await patron("GET", "/api/numbers");
    expect(list.json.numbers[0]).toMatchObject({ status: "WORKING", me_id: "905551112233@s.whatsapp.net" });

    // Temsilci ve salt okunur kullanıcıya numarayı ata.
    await patron("PUT", `/api/users/${temsilciId}`, { numberIds: [numberId] });
    await patron("PUT", `/api/users/${okurId}`, { numberIds: [numberId] });
    const ali = await t.client("ali");
    const veli = await t.client("veli");
    const baska = await t.client("baska");

    // Canlı akışı dinle (ali).
    const events: LiveEvent[] = [];
    const unsubscribe = t.hub.subscribe(temsilciId, (e) => events.push(e));

    // Müşteriden mesaj gelir.
    expect(
      (await patron("POST", "/api/dev/inbound", { numberId, from: "05329998877", name: "Ayşe", text: "Merhaba" })).status,
    ).toBe(200);
    const chats = await ali("GET", `/api/numbers/${numberId}/chats`);
    expect(chats.json.chats).toHaveLength(1);
    const chat = chats.json.chats[0];
    expect(chat).toMatchObject({ name: "Ayşe", remote_id: "905329998877@s.whatsapp.net", last_text: "Merhaba", unread: 1 });
    expect(events.at(-1)).toMatchObject({ type: "message", message: { source: "contact", body: "Merhaba" } });
    expect(t.pushes.at(-1)).toMatchObject({ title: "Ayşe · Satış", body: "Merhaba" });

    // Temsilci panelden cevap yazar; mesajda kimin yazdığı görünür.
    expect((await ali("POST", `/api/chats/${chat.id}/messages`, { text: "Hoş geldiniz" })).status).toBe(200);
    const history = await veli("GET", `/api/chats/${chat.id}/messages`);
    expect(history.json.messages.map((m: any) => [m.source, m.body, m.sent_by_name])).toEqual([
      ["contact", "Merhaba", null],
      ["panel", "Hoş geldiniz", "ALI"],
    ]);
    expect(t.pushes.at(-1)).toMatchObject({ title: "Satış → Ayşe", body: "ALI: Hoş geldiniz", except: temsilciId });

    // Okundu.
    await ali("POST", `/api/chats/${chat.id}/read`);
    expect((await ali("GET", `/api/chats/${chat.id}`)).json.chat.unread).toBe(0);

    // Salt okunur yazamaz, atanmamış kullanıcı göremez, temsilci yönetemez.
    expect((await veli("POST", `/api/chats/${chat.id}/messages`, { text: "x" })).status).toBe(403);
    expect((await baska("GET", `/api/chats/${chat.id}/messages`)).status).toBe(404);
    expect((await baska("GET", "/api/numbers")).json.numbers).toEqual([]);
    expect((await ali("POST", "/api/numbers", { label: "X", phone: "905550000000" })).status).toBe(403);
    expect((await ali("GET", "/api/users")).status).toBe(403);

    // Yeni sohbet başlatma.
    const started = await ali("POST", `/api/numbers/${numberId}/chats`, { phone: "0533 444 55 66", text: "İlk mesaj" });
    expect(started.json.chat).toMatchObject({ remote_id: "905334445566@s.whatsapp.net", last_text: "İlk mesaj", unread: 0 });

    unsubscribe();
  });

  test("aynı sağlayıcı kimliğiyle gelen mesaj bir kez kaydedilir, telefondan yazılan 'phone' olur", async () => {
    await t.addUser("patron", "patron");
    const patron = await t.client("patron");
    const numberId = (await patron("POST", "/api/numbers", { label: "Destek", phone: "905551112233" })).json.number.id;
    const svc = createMessageService({
      db: t.db,
      hub: t.hub,
      notifier: { publicKey: "", notifyNumber: async () => {} },
      logger: createLogger({ level: "silent" }),
    });
    const base = { kind: "message" as const, session: `n${numberId}`, remoteId: "905320000000@s.whatsapp.net", ts: 1000 };
    await svc.handleInbound({ ...base, providerId: "A", contactName: null, source: "phone", body: "Telefondan" });
    await svc.handleInbound({ ...base, providerId: "A", contactName: null, source: "phone", body: "Telefondan" });
    // Geç gelen eski mesaj son mesajı ezmez.
    await svc.handleInbound({ ...base, providerId: "B", contactName: "Can", source: "contact", body: "Eski", ts: 500 });

    const chat = (await patron("GET", `/api/numbers/${numberId}/chats`)).json.chats[0];
    expect(chat).toMatchObject({ name: "Can", last_text: "Telefondan", last_message_at: 1000, unread: 1 });
    const msgs = (await patron("GET", `/api/chats/${chat.id}/messages`)).json.messages;
    expect(msgs.map((m: any) => [m.body, m.direction, m.source])).toEqual([
      ["Eski", "in", "contact"],
      ["Telefondan", "out", "phone"],
    ]);
    // Sayfalama: 1000'den önceki mesajlar.
    const older = (await patron("GET", `/api/chats/${chat.id}/messages?before=1000`)).json.messages;
    expect(older.map((m: any) => m.body)).toEqual(["Eski"]);
  });
});
