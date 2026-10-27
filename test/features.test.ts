// Sohbet durumu, etiketler, notlar, "şu an bakıyor", cevap süresi raporu, CSV dışa aktarma.
import { beforeEach, describe, expect, test } from "bun:test";
import type { LiveEvent } from "../src/shared/types";
import { ROLE, type TestContext, setup } from "./helpers";

let t: TestContext;
beforeEach(() => {
  t = setup();
});

const prepare = async () => {
  const patronId = await t.addUser("patron", ROLE.patron);
  const patron = await t.login("patron");
  const satis = await t.addNumber(patron, "Satış", "905551112233");
  await t.inbound(patron, satis, "905320000001", "Ayşe", "Merhaba");
  const chatId = (await patron("GET", `/api/numbers/${satis}/chats`)).json.chats[0].id as number;
  const aliId = await t.addUser("ali", ROLE.temsilci, [{ numberId: satis, access: "write" }]);
  const veliId = await t.addUser("veli", ROLE.salt_okunur, [{ numberId: satis, access: "read" }]);
  const ali = await t.login("ali");
  const veli = await t.login("veli");
  return { patron, patronId, satis, chatId, ali, aliId, veli, veliId };
};

describe("sohbet durumu", () => {
  test("kapat, filtrele, müşteri yazınca yeniden açılır", async () => {
    const { patron, satis, chatId, ali, veli } = await prepare();
    expect((await ali("GET", `/api/chats/${chatId}`)).json.chat).toMatchObject({ status: "open", tags: [] });
    expect((await veli("PUT", `/api/chats/${chatId}/status`, { status: "closed" })).status).toBe(403);
    expect((await ali("PUT", `/api/chats/${chatId}/status`, { status: "closed" })).json.chat.status).toBe("closed");
    expect((await ali("GET", `/api/numbers/${satis}/chats?status=open`)).json.chats).toHaveLength(0);
    expect((await ali("GET", `/api/numbers/${satis}/chats?status=closed`)).json.chats).toHaveLength(1);
    expect((await ali("GET", `/api/numbers/${satis}/chats?status=x`)).status).toBe(400);

    // Telefondan/panelden yazmak açmaz, müşteri yazınca açılır.
    await ali("POST", `/api/chats/${chatId}/messages`, { text: "Kapanış notu" });
    expect((await ali("GET", `/api/chats/${chatId}`)).json.chat.status).toBe("closed");
    await t.inbound(patron, satis, "905320000001", "Ayşe", "Bir sorum daha var");
    expect((await ali("GET", `/api/chats/${chatId}`)).json.chat.status).toBe("open");
  });
});

describe("etiketler", () => {
  test("yönetim, sohbete takma, filtre, silinince sohbetten kalkar", async () => {
    const { patron, satis, chatId, ali, aliId } = await prepare();
    const events: LiveEvent[] = [];
    const off = t.hub.subscribe(aliId, (e) => events.push(e));

    expect((await ali("POST", "/api/tags", { name: "VIP", color: "purple" })).status).toBe(403);
    const vip = (await patron("POST", "/api/tags", { name: "VIP", color: "purple" })).json.tag;
    const iade = (await patron("POST", "/api/tags", { name: "İade", color: "red" })).json.tag;
    expect((await patron("POST", "/api/tags", { name: "vip", color: "blue" })).status).toBe(400);
    expect((await patron("POST", "/api/tags", { name: "X", color: "siyah" })).status).toBe(400);
    expect(events.filter((e) => e.type === "tags_changed")).toHaveLength(2);
    expect((await ali("GET", "/api/tags")).json.tags.map((x: any) => x.name)).toEqual(["İade", "VIP"]);

    const tagged = await ali("PUT", `/api/chats/${chatId}/tags`, { tagIds: [vip.id, iade.id, 999] });
    expect(tagged.json.chat.tags).toEqual([vip.id, iade.id].sort((a, b) => a - b));
    expect(events.at(-1)).toMatchObject({ type: "chat_updated", chat: { id: chatId } });
    expect((await ali("GET", `/api/numbers/${satis}/chats?tag=${vip.id}`)).json.chats).toHaveLength(1);
    expect((await ali("GET", `/api/numbers/${satis}/chats?tag=12345`)).json.chats).toHaveLength(0);

    await patron("PUT", `/api/tags/${vip.id}`, { color: "green" });
    await patron("DELETE", `/api/tags/${iade.id}`);
    expect((await ali("GET", `/api/chats/${chatId}`)).json.chat.tags).toEqual([vip.id]);
    expect((await ali("GET", "/api/tags")).json.tags).toEqual([{ id: vip.id, name: "VIP", color: "green" }]);
    off();
  });
});

describe("notlar", () => {
  test("ekip içi not: ekleme, okuma, silme kuralları, izleme modu", async () => {
    const { patron, chatId, ali, aliId, veli } = await prepare();
    const events: LiveEvent[] = [];
    const off = t.hub.subscribe(aliId, (e) => events.push(e));

    // Salt okunur da not ekleyebilir (mesaj göndermiyor).
    const note = (await veli("POST", `/api/chats/${chatId}/notes`, { text: "Müşteri iade istiyor" })).json.note;
    expect(note).toMatchObject({ user_name: "VELI", as_user_name: null, body: "Müşteri iade istiyor" });
    expect(events.at(-1)).toMatchObject({ type: "note", chatId, note: { id: note.id } });
    expect((await ali("GET", `/api/chats/${chatId}/notes`)).json.notes).toHaveLength(1);

    // Başkasının notunu silemez; patron (users.manage) silebilir.
    expect((await ali("DELETE", `/api/chats/${chatId}/notes/${note.id}`)).status).toBe(403);
    const own = (await ali("POST", `/api/chats/${chatId}/notes`, { text: "Kargoya sordum" })).json.note;
    expect((await ali("DELETE", `/api/chats/${chatId}/notes/${own.id}`)).status).toBe(200);
    expect(events.at(-1)).toMatchObject({ type: "note_deleted", noteId: own.id });
    expect((await patron("DELETE", `/api/chats/${chatId}/notes/${note.id}`)).status).toBe(200);

    // Ekranına geçip gönderebilir modda not: "PATRON (ALI olarak)".
    await patron("POST", "/api/auth/impersonate", { userId: aliId });
    const asAli = (await patron("POST", `/api/chats/${chatId}/notes`, { text: "Patron notu" })).json.note;
    expect(asAli).toMatchObject({ user_name: "PATRON", as_user_name: "ALI" });
    await patron("POST", "/api/auth/impersonate/stop");

    // İzleme modunda not yazılamaz.
    const role = await patron("POST", "/api/roles", {
      name: "Gözetmen",
      permissions: ["numbers.view_all", "messages.send", "chats.start", "impersonate.view"],
    });
    await t.addUser("gozetmen", role.json.role.id);
    const gozetmen = await t.login("gozetmen");
    await gozetmen("POST", "/api/auth/impersonate", { userId: aliId });
    expect((await gozetmen("POST", `/api/chats/${chatId}/notes`, { text: "x" })).status).toBe(403);
    expect((await gozetmen("GET", `/api/chats/${chatId}/notes`)).status).toBe(200);
    off();
  });
});

describe("şu an bakıyor", () => {
  test("bakanlar listesi ve olay; ekranına geçen sayılmaz", async () => {
    const { patron, chatId, ali, aliId, veli } = await prepare();
    const events: LiveEvent[] = [];
    const off = t.hub.subscribe(aliId, (e) => events.push(e));

    expect((await ali("POST", `/api/chats/${chatId}/viewing`)).json.viewers).toEqual([{ id: aliId, name: "ALI" }]);
    const both = (await veli("POST", `/api/chats/${chatId}/viewing`)).json.viewers;
    expect(both.map((v: any) => v.name)).toEqual(["ALI", "VELI"]);
    expect(events.filter((e) => e.type === "viewers")).toHaveLength(2);
    // Aynı kişinin tekrar haber vermesi olay üretmez.
    await ali("POST", `/api/chats/${chatId}/viewing`);
    expect(events.filter((e) => e.type === "viewers")).toHaveLength(2);

    await patron("POST", "/api/auth/impersonate", { userId: aliId });
    expect((await patron("POST", `/api/chats/${chatId}/viewing`)).json.viewers).toHaveLength(2);
    off();
  });
});

describe("rapor ve dışa aktarma", () => {
  test("cevap süresi ve CSV", async () => {
    const { patron, satis, chatId, ali, aliId, veli } = await prepare();
    // Mesaj zamanlarını elle ayarla: müşteri 0, 10 sn'de tekrar yazar; ali 60 sn'de cevaplar.
    const base = Date.now() - 60 * 60 * 1000;
    t.db.query("UPDATE messages SET ts = ? WHERE chat_id = ?").run(base, chatId);
    await t.inbound(patron, satis, "905320000001", "Ayşe", "Orada mısınız?");
    t.db.query("UPDATE messages SET ts = ? WHERE body = ?").run(base + 10_000, "Orada mısınız?");
    await ali("POST", `/api/chats/${chatId}/messages`, { text: "=SUM(A1) buradayım; \"merhaba\"" });
    t.db.query("UPDATE messages SET ts = ? WHERE source = 'panel'").run(base + 60_000);

    const summary = (await patron("GET", "/api/reports/summary?days=1")).json;
    expect(summary.response).toEqual({ averageMs: 60_000, medianMs: 60_000, samples: 1 });
    expect(summary.perUser).toEqual([{ userId: aliId, name: "ALI", sent: 1, replies: 1, avgResponseMs: 60_000 }]);

    // CSV: izin gerekir; Türkçe Excel için BOM + ";"; formül enjeksiyonu etkisiz.
    expect((await ali("GET", `/api/chats/${chatId}/export`)).status).toBe(403);
    const res = await t.app.request(`/api/chats/${chatId}/export`, {
      headers: { cookie: await cookieOf("patron") },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const csv = await res.text();
    expect(csv.startsWith("﻿Zaman;Yön;Kaynak;Yazan;Mesaj")).toBe(true);
    expect(csv).toContain(`Giden;Panel;ALI;"'=SUM(A1) buradayım; ""merhaba"""`);

    const auditCsv = await t.app.request("/api/audit/export?action=chat.export", { headers: { cookie: await cookieOf("patron") } });
    expect(auditCsv.status).toBe(200);
    expect(await auditCsv.text()).toContain("chat.export");
    expect((await veli("GET", "/api/audit/export")).status).toBe(403);
  });
});

// Ham istek için çerez.
const cookieOf = async (username: string) => {
  const res = await t.app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "secret1" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0]!;
};
