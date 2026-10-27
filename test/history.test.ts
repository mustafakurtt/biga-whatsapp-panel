// Kişi adları (rehber, profil adı, anlamsız ad) ve ilk eşleştirmedeki geçmişin sessizce içe aktarılması.
import { beforeEach, describe, expect, test } from "bun:test";
import { HISTORY_PER_CHAT } from "../src/modules/messages/messages.service";
import type { InboundMessage } from "../src/shared/contracts";
import type { LiveEvent } from "../src/shared/types";
import { ROLE, type Api, type TestContext, setup } from "./helpers";

let t: TestContext;
let patron: Api;
let numberId: number;
let session: string;
beforeEach(async () => {
  t = setup();
  await t.addUser("patron", ROLE.patron);
  patron = await t.login("patron");
  numberId = await t.addNumber(patron, "Satış", "905551112233");
  session = t.db.query<{ session: string }, [number]>("SELECT session FROM numbers WHERE id = ?").get(numberId)!.session;
});

const AYSE = "905320000001@s.whatsapp.net";
const chatsOf = async () => (await patron("GET", `/api/numbers/${numberId}/chats`)).json.chats as {
  id: number;
  remote_id: string;
  name: string;
  unread: number;
  status: string;
  last_text: string;
}[];
const msg = (over: Partial<InboundMessage> & { ts: number }): InboundMessage => ({
  providerId: `h_${over.ts}_${over.remoteId ?? AYSE}`,
  remoteId: AYSE,
  contactName: null,
  source: "contact",
  body: `mesaj ${over.ts}`,
  ...over,
});
const contacts = (list: { remoteId: string; name: string }[]) => t.messages.handleInbound({ kind: "contacts", session, contacts: list });

describe("kişi adları", () => {
  test("anlamsız profil adı yerine numara gösterilir", async () => {
    await t.inbound(patron, numberId, "905320000001", ".", "Selam");
    const [chat] = await chatsOf();
    expect(chat!.name).toBe("+905320000001");
    // Sonradan anlamlı bir ad gelirse kullanılır.
    await t.inbound(patron, numberId, "905320000001", "Ayşe", "Ben Ayşe");
    expect((await chatsOf())[0]!.name).toBe("Ayşe");
  });

  test("rehberdeki ad profil adından önceliklidir, önce de sonra da gelse", async () => {
    // Rehber adı sohbet oluşmadan gelir.
    await contacts([{ remoteId: AYSE, name: "Ayşe Müşteri" }]);
    await t.inbound(patron, numberId, "905320000001", "ayşe_99", "Merhaba");
    expect((await chatsOf())[0]!.name).toBe("Ayşe Müşteri");

    // Rehber adı sohbet oluştuktan sonra gelir: var olan sohbetin adı güncellenir ve liste olayı yayılır.
    await t.inbound(patron, numberId, "905320000002", "Mehmet", "Fiyat?");
    const events: LiveEvent[] = [];
    const off = t.hub.subscribe(1, (e) => events.push(e));
    await contacts([{ remoteId: "905320000002@s.whatsapp.net", name: "Mehmet Bey (Toptan)" }, { remoteId: AYSE, name: "." }]);
    off();
    const names = (await chatsOf()).map((c) => c.name).sort();
    expect(names).toEqual(["Ayşe Müşteri", "Mehmet Bey (Toptan)"]);
    expect(events).toEqual([{ type: "chats_synced", numberId }]);
    // Profil adı rehber adını ezmez.
    await t.inbound(patron, numberId, "905320000002", "Memo", "Tamam");
    expect((await chatsOf()).find((c) => c.remote_id.startsWith("905320000002"))!.name).toBe("Mehmet Bey (Toptan)");
  });
});

describe("geçmiş eşitlemesi", () => {
  test("sohbet başına son mesajlar sessizce içe aktarılır", async () => {
    const events: LiveEvent[] = [];
    const off = t.hub.subscribe(1, (e) => events.push(e));
    const base = Date.now() - 60_000;
    const ayse = Array.from({ length: 8 }, (_, i) =>
      msg({ ts: base + i * 1000, contactName: "Ayşe", source: i % 2 ? "phone" : "contact" }),
    );
    const mehmet = [msg({ ts: base + 500, remoteId: "905320000002@s.whatsapp.net", contactName: "Mehmet" })];
    await t.messages.handleInbound({ kind: "history", session, messages: [...ayse, ...mehmet] });
    off();

    const list = await chatsOf();
    expect(list.map((c) => c.name)).toEqual(["Ayşe", "Mehmet"]); // son mesaja göre
    expect(list.every((c) => c.unread === 0 && c.status === "open")).toBe(true);
    expect(list[0]!.last_text).toBe(`mesaj ${base + 7000}`);

    const messages = (await patron("GET", `/api/chats/${list[0]!.id}/messages`)).json.messages as { body: string; source: string }[];
    expect(messages).toHaveLength(HISTORY_PER_CHAT);
    expect(messages.map((m) => m.body)).toEqual(ayse.slice(-HISTORY_PER_CHAT).map((m) => m.body));
    expect(messages.map((m) => m.source)).toEqual(["phone", "contact", "phone", "contact", "phone"]);

    // Bildirim yok, mesaj olayı yok; liste için tek bir olay.
    expect(t.pushes).toHaveLength(0);
    expect(events).toEqual([{ type: "chats_synced", numberId }]);

    // Aynı paket tekrar gelirse hiçbir şey değişmez.
    await t.messages.handleInbound({ kind: "history", session, messages: ayse });
    expect((await patron("GET", `/api/chats/${list[0]!.id}/messages`)).json.messages).toHaveLength(HISTORY_PER_CHAT);
  });

  test("geçmiş, kapalı sohbeti açmaz ve okunmamışı artırmaz; yeni mesaj artırır", async () => {
    await t.inbound(patron, numberId, "905320000001", "Ayşe", "Yeni");
    const chatId = (await chatsOf())[0]!.id;
    await patron("POST", `/api/chats/${chatId}/read`);
    await patron("PUT", `/api/chats/${chatId}/status`, { status: "closed" });
    // Eski bir mesaj geçmişle gelir: son mesaj bilgisini de ezmez.
    await t.messages.handleInbound({ kind: "history", session, messages: [msg({ ts: Date.now() - 3_600_000, body: "eski" })] });
    expect((await chatsOf())[0]).toMatchObject({ unread: 0, status: "closed", last_text: "Yeni" });
    await t.inbound(patron, numberId, "905320000001", "Ayşe", "Tekrar");
    expect((await chatsOf())[0]).toMatchObject({ unread: 1, status: "open" });
  });
});

describe("geçmiş parçalar halinde gelir", () => {
  test("yeni parça önce gelse de sonradan gelen eski parça sınırı aşmaz", async () => {
    const base = Date.now() - 60_000;
    const part1 = Array.from({ length: 4 }, (_, i) => msg({ ts: base + i * 1000, contactName: "Ayşe" }));
    const part2 = Array.from({ length: 4 }, (_, i) => msg({ ts: base + 10_000 + i * 1000, contactName: "Ayşe" }));
    // Sağlayıcı parçaları birleştirir; burada en kötü sıra denenir: yeni parça önce, eski parça sonra.
    await t.messages.handleInbound({ kind: "history", session, messages: part2 });
    await t.messages.handleInbound({ kind: "history", session, messages: part1 });
    // Eski parça sonradan gelse de sınır aşılmaz.
    await t.messages.handleInbound({ kind: "history", session, messages: [msg({ ts: base - 5000 })] });
    const chatId = (await chatsOf())[0]!.id;
    const bodies = ((await patron("GET", `/api/chats/${chatId}/messages`)).json.messages as { body: string }[]).map((m) => m.body);
    expect(bodies).toHaveLength(HISTORY_PER_CHAT);
    expect(bodies.at(-1)).toBe(`mesaj ${base + 13_000}`);
  });
});

describe("iki panel numarası birbirine yazar", () => {
  test("WhatsApp aynı mesaj kimliğini iki tarafta da verir; mesaj iki sohbete de kaydedilir", async () => {
    const other = await t.addNumber(patron, "Destek", "905551112244");
    const otherSession = t.db.query<{ session: string }, [number]>("SELECT session FROM numbers WHERE id = ?").get(other)!.session;
    // Satış, Destek numarasına yazdı (telefondan): Satış tarafında giden, Destek tarafında gelen; kimlik aynı.
    const id = "3EB0AYNIKIMLIK";
    await t.messages.handleInbound({ kind: "message", session, providerId: id, remoteId: "905551112244@s.whatsapp.net", contactName: null, source: "phone", body: "Selam Destek", ts: Date.now() });
    await t.messages.handleInbound({ kind: "message", session: otherSession, providerId: id, remoteId: "905551112233@s.whatsapp.net", contactName: "Satış", source: "contact", body: "Selam Destek", ts: Date.now() });
    const inbox = (await patron("GET", `/api/numbers/${other}/chats`)).json.chats as { id: number; unread: number }[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.unread).toBe(1);
    expect((await patron("GET", `/api/chats/${inbox[0]!.id}/messages`)).json.messages).toHaveLength(1);
    // Aynı sohbette tekrar gelen kimlik yine tek kayıt.
    await t.messages.handleInbound({ kind: "message", session: otherSession, providerId: id, remoteId: "905551112233@s.whatsapp.net", contactName: "Satış", source: "contact", body: "Selam Destek", ts: Date.now() });
    expect((await patron("GET", `/api/chats/${inbox[0]!.id}/messages`)).json.messages).toHaveLength(1);
  });
});
