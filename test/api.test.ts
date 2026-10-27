// Uçtan uca API testleri: mesaj akışı, numara erişimi, arama, atama, hazır yanıtlar, raporlar.
import { createLogger } from "@mustafakurtt/hono-core/logger";
import { beforeEach, describe, expect, test } from "bun:test";
import { createMessageService } from "../src/modules/messages/messages.service";
import { MOCK_PAIRING_CODE } from "../src/providers/mock.provider";
import type { LiveEvent } from "../src/shared/types";
import { ROLE, type TestContext, setup } from "./helpers";

let t: TestContext;
beforeEach(() => {
  t = setup();
});

describe("giriş", () => {
  test("yanlış şifre 401 ve kayda geçer, doğru şifre Me döner", async () => {
    await t.addUser("patron", ROLE.patron);
    const bad = await t.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "patron", password: "yanlis" }),
    });
    expect(bad.status).toBe(401);
    const api = await t.login("patron");
    const me = await api("GET", "/api/auth/me");
    expect(me.json.actor).toBeNull();
    expect(me.json.user).toMatchObject({ username: "patron", roleName: "Patron" });
    expect(me.json.user.permissions).toContain("impersonate.send");
    const audit = await api("GET", "/api/audit");
    expect(audit.json.entries.map((e: any) => e.action)).toEqual(["auth.login", "auth.login_failed"]);
  });

  test("çerezsiz istek 401", async () => {
    const res = await t.app.request("/api/numbers");
    expect(res.status).toBe(401);
  });

  test("devre dışı hesap giriş yapamaz, açık oturumu düşer", async () => {
    await t.addUser("patron", ROLE.patron);
    const aliId = await t.addUser("ali", ROLE.temsilci);
    const patron = await t.login("patron");
    const ali = await t.login("ali");
    expect((await patron("PUT", `/api/users/${aliId}`, { active: false })).status).toBe(200);
    expect((await ali("GET", "/api/numbers")).status).toBe(401);
    const res = await t.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ali", password: "secret1" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("numaralar ve mesajlar", () => {
  test("numara ekle, eşleştir, gelen ve giden mesaj", async () => {
    await t.addUser("patron", ROLE.patron);
    const patron = await t.login("patron");

    const created = await patron("POST", "/api/numbers", { label: "Satış", phone: "0555 111 22 33" });
    expect(created.json.number).toMatchObject({ label: "Satış", phone: "905551112233", status: "SCAN_QR_CODE", access: "write" });
    const numberId = created.json.number.id as number;
    expect((await patron("POST", "/api/numbers", { label: "Tekrar", phone: "+90 555 111 22 33" })).status).toBe(400);
    expect((await patron("POST", `/api/numbers/${numberId}/pair`)).json).toEqual({ code: MOCK_PAIRING_CODE });
    await new Promise((r) => setTimeout(r, 5));

    const aliId = await t.addUser("ali", ROLE.temsilci, [{ numberId, access: "write" }]);
    const ali = await t.login("ali");
    const events: LiveEvent[] = [];
    const unsubscribe = t.hub.subscribe(aliId, (e) => events.push(e));

    await t.inbound(patron, numberId, "05329998877", "Ayşe", "Merhaba");
    const list = await ali("GET", "/api/numbers");
    expect(list.json.numbers[0]).toMatchObject({ status: "WORKING", access: "write", unread: 1 });
    const chat = (await ali("GET", `/api/numbers/${numberId}/chats`)).json.chats[0];
    expect(chat).toMatchObject({ name: "Ayşe", remote_id: "905329998877@s.whatsapp.net", unread: 1, assigned_to: null });
    expect(events.at(-1)).toMatchObject({ type: "message", message: { source: "contact", body: "Merhaba" } });
    expect(t.pushes.at(-1)).toMatchObject({ title: "Ayşe · Satış", body: "Merhaba" });

    expect((await ali("POST", `/api/chats/${chat.id}/messages`, { text: "Hoş geldiniz" })).status).toBe(200);
    const history = (await ali("GET", `/api/chats/${chat.id}/messages`)).json.messages;
    expect(history.map((m: any) => [m.source, m.body, m.sent_by_name, m.as_user_name])).toEqual([
      ["contact", "Merhaba", null, null],
      ["panel", "Hoş geldiniz", "ALI", null],
    ]);
    expect(t.pushes.at(-1)).toMatchObject({ title: "Satış → Ayşe", body: "ALI: Hoş geldiniz", except: aliId });

    await ali("POST", `/api/chats/${chat.id}/read`);
    expect((await ali("GET", `/api/chats/${chat.id}`)).json.chat.unread).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: "chat_updated", chat: { unread: 0 } });

    const started = await ali("POST", `/api/numbers/${numberId}/chats`, { phone: "0533 444 55 66", text: "İlk mesaj" });
    expect(started.json.chat).toMatchObject({ remote_id: "905334445566@s.whatsapp.net", last_text: "İlk mesaj" });
    unsubscribe();
  });

  test("tekrar gelen olay bir kez kaydedilir, geç gelen eski mesaj son mesajı ezmez, sayfalama", async () => {
    await t.addUser("patron", ROLE.patron);
    const patron = await t.login("patron");
    const numberId = await t.addNumber(patron, "Destek", "905551112233");
    const svc = createMessageService({
      db: t.db,
      hub: t.hub,
      notifier: { publicKey: "", notifyNumber: async () => {} },
      logger: createLogger({ level: "silent" }),
    });
    const base = { kind: "message" as const, session: `n${numberId}`, remoteId: "905320000000@s.whatsapp.net", ts: 1000 };
    await svc.handleInbound({ ...base, providerId: "A", contactName: null, source: "phone", body: "Telefondan" });
    await svc.handleInbound({ ...base, providerId: "A", contactName: null, source: "phone", body: "Telefondan" });
    await svc.handleInbound({ ...base, providerId: "B", contactName: "Can", source: "contact", body: "Eski", ts: 500 });

    const chat = (await patron("GET", `/api/numbers/${numberId}/chats`)).json.chats[0];
    expect(chat).toMatchObject({ name: "Can", last_text: "Telefondan", last_message_at: 1000, unread: 1 });
    const msgs = (await patron("GET", `/api/chats/${chat.id}/messages`)).json.messages;
    expect(msgs.map((m: any) => [m.body, m.direction, m.source])).toEqual([
      ["Eski", "in", "contact"],
      ["Telefondan", "out", "phone"],
    ]);
    const older = (await patron("GET", `/api/chats/${chat.id}/messages?before=1000`)).json.messages;
    expect(older.map((m: any) => m.body)).toEqual(["Eski"]);
  });
});

describe("numara erişimi", () => {
  test("yok / okuma / yazma ve view_all", async () => {
    await t.addUser("patron", ROLE.patron);
    const patron = await t.login("patron");
    const satis = await t.addNumber(patron, "Satış", "905551112233");
    const destek = await t.addNumber(patron, "Destek", "905551112244");
    await t.inbound(patron, satis, "905320000001", "Müşteri", "Merhaba");
    const chatId = (await patron("GET", `/api/numbers/${satis}/chats`)).json.chats[0].id;

    // Temsilci: Satış'a okuma, Destek'e yazma.
    await t.addUser("ali", ROLE.temsilci, [
      { numberId: satis, access: "read" },
      { numberId: destek, access: "write" },
    ]);
    const ali = await t.login("ali");
    const numbers = (await ali("GET", "/api/numbers")).json.numbers;
    expect(numbers.map((n: any) => [n.label, n.access])).toEqual([
      ["Destek", "write"],
      ["Satış", "read"],
    ]);
    expect((await ali("GET", `/api/chats/${chatId}/messages`)).status).toBe(200);
    expect((await ali("POST", `/api/chats/${chatId}/messages`, { text: "x" })).status).toBe(403);
    expect((await ali("POST", `/api/numbers/${satis}/chats`, { phone: "905320000009", text: "x" })).status).toBe(403);
    expect((await ali("POST", `/api/numbers/${destek}/chats`, { phone: "905320000009", text: "x" })).status).toBe(200);

    // Salt okunur rolünde "write" ataması bile okuma sayılır.
    await t.addUser("veli", ROLE.salt_okunur, [{ numberId: satis, access: "write" }]);
    const veli = await t.login("veli");
    expect((await veli("GET", "/api/numbers")).json.numbers[0].access).toBe("read");
    expect((await veli("POST", `/api/chats/${chatId}/messages`, { text: "x" })).status).toBe(403);

    // Atanmamış: göremez (404), listede yok.
    await t.addUser("baska", ROLE.temsilci);
    const baska = await t.login("baska");
    expect((await baska("GET", "/api/numbers")).json.numbers).toEqual([]);
    expect((await baska("GET", `/api/chats/${chatId}/messages`)).status).toBe(404);
    expect((await baska("GET", `/api/numbers/${satis}/chats`)).status).toBe(404);

    // Özel rol: atama olmadan tüm numaraları okur.
    const role = await patron("POST", "/api/roles", { name: "Denetçi", permissions: ["numbers.view_all", "audit.view"] });
    expect(role.json.role).toMatchObject({ name: "Denetçi", permissions: ["numbers.view_all", "audit.view"], system: false });
    await t.addUser("denetci", role.json.role.id);
    const denetci = await t.login("denetci");
    expect((await denetci("GET", "/api/numbers")).json.numbers.map((n: any) => n.access)).toEqual(["read", "read"]);
    expect((await denetci("GET", "/api/audit")).status).toBe(200);
    expect((await denetci("GET", "/api/users")).status).toBe(403);

    // Yetkisiz yönetim denemeleri.
    expect((await ali("POST", "/api/numbers", { label: "X", phone: "905550000000" })).status).toBe(403);
    expect((await ali("GET", "/api/users")).status).toBe(403);
    expect((await ali("GET", "/api/roles")).status).toBe(403);
    expect((await ali("GET", "/api/audit")).status).toBe(403);
    expect((await ali("GET", "/api/reports/summary")).status).toBe(403);
  });
});

describe("arama, atama, hazır yanıt, rapor", () => {
  test("hepsi bir arada", async () => {
    await t.addUser("patron", ROLE.patron);
    const patron = await t.login("patron");
    const satis = await t.addNumber(patron, "Satış", "905551112233");
    const gizli = await t.addNumber(patron, "Gizli", "905551112299");
    await t.inbound(patron, satis, "905320000001", "Ayşe", "Fatura numaram 100%_A");
    await t.inbound(patron, gizli, "905320000002", "Gizli Kişi", "Fatura gizli");
    const aliId = await t.addUser("ali", ROLE.temsilci, [{ numberId: satis, access: "write" }]);
    const veliId = await t.addUser("veli", ROLE.temsilci, [{ numberId: satis, access: "write" }]);
    const ali = await t.login("ali");
    const veli = await t.login("veli");

    // Arama sadece görülebilir numaralarda; % ve _ düz metin.
    const found = (await ali("GET", "/api/search?q=fatura")).json.results;
    expect(found.map((r: any) => [r.numberLabel, r.chat.name])).toEqual([["Satış", "Ayşe"]]);
    expect((await ali("GET", "/api/search?q=100%25_")).json.results).toHaveLength(1);
    expect((await ali("GET", "/api/search?q=0%25")).json.results).toHaveLength(1);
    expect((await ali("GET", "/api/search?q=a")).status).toBe(400);
    expect((await ali("GET", `/api/numbers/${satis}/chats?q=ayş`)).json.chats).toHaveLength(1);
    expect((await ali("GET", `/api/numbers/${satis}/chats?q=yok`)).json.chats).toHaveLength(0);

    // Atama: ali üstlenir; veli başkasınınkini alamaz (chats.assign yok); patron atar.
    const chatId = found[0].chat.id;
    const mine = await ali("PUT", `/api/chats/${chatId}/assign`, { userId: aliId });
    expect(mine.json.chat).toMatchObject({ assigned_to: aliId, assigned_name: "ALI" });
    expect((await ali("GET", `/api/numbers/${satis}/chats?filter=mine`)).json.chats).toHaveLength(1);
    expect((await ali("GET", `/api/numbers/${satis}/chats?filter=unassigned`)).json.chats).toHaveLength(0);
    expect((await veli("PUT", `/api/chats/${chatId}/assign`, { userId: veliId })).status).toBe(403);
    expect((await patron("PUT", `/api/chats/${chatId}/assign`, { userId: veliId })).json.chat.assigned_name).toBe("VELI");
    expect((await ali("GET", `/api/numbers/${satis}/chats?filter=unread`)).json.chats).toHaveLength(1);

    // Numarayı göremeyen kullanıcıya atanamaz.
    const baskaId = await t.addUser("baska", ROLE.temsilci);
    expect((await patron("PUT", `/api/chats/${chatId}/assign`, { userId: baskaId })).status).toBe(400);

    // Hazır yanıtlar: herkes okur, sadece yetkili yönetir.
    expect((await ali("POST", "/api/quick-replies", { title: "x", body: "y" })).status).toBe(403);
    const qr = await patron("POST", "/api/quick-replies", { title: "Selam", body: "Merhaba, nasıl yardımcı olabilirim?" });
    expect((await ali("GET", "/api/quick-replies")).json.items).toEqual([qr.json.item]);
    await patron("PUT", `/api/quick-replies/${qr.json.item.id}`, { title: "Selamlama" });
    expect((await ali("GET", "/api/quick-replies")).json.items[0].title).toBe("Selamlama");

    // Rapor.
    await ali("POST", `/api/chats/${chatId}/messages`, { text: "Bakıyorum" });
    const summary = (await patron("GET", "/api/reports/summary?days=7")).json;
    expect(summary.totals).toEqual({ incoming: 2, outgoing: 1, panel: 1, phone: 0, chats: 2 });
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.at(-1)).toMatchObject({ incoming: 2, outgoing: 1 });
    expect(summary.perUser).toEqual([{ userId: aliId, name: "ALI", sent: 1 }]);
    expect((await patron("GET", "/api/reports/summary?days=0")).status).toBe(400);
  });
});
