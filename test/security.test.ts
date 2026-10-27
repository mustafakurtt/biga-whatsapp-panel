// Güvenlik: ekranına geçerken erişim sınırı, canlı akış ve push'un yetkiden düşmesi, yetki dağıtma sınırı,
// CSRF/JSON zorunluluğu, giriş kilidi, izleme modunun salt okunurluğu, oturumların şifreyle düşmesi.
import { beforeEach, describe, expect, test } from "bun:test";
import type { LiveEvent } from "../src/shared/types";
import { PASSWORD, ROLE, type TestContext, setup } from "./helpers";

let t: TestContext;
beforeEach(() => {
  t = setup();
});

// Patron, A ve B numaraları, B'de bir sohbet; sup: A'yı okur; ali: B'ye yazar.
const prepare = async (supPermissions: string[]) => {
  await t.addUser("patron", ROLE.patron);
  const patron = await t.login("patron");
  const a = await t.addNumber(patron, "A", "905551110001");
  const b = await t.addNumber(patron, "B", "905551110002");
  await t.inbound(patron, b, "905320000001", "Gizli", "B gizli mesaj");
  const chatB = (await patron("GET", `/api/numbers/${b}/chats`)).json.chats[0].id as number;
  const role = (await patron("POST", "/api/roles", { name: "Sup", permissions: supPermissions })).json.role;
  const supId = await t.addUser("sup", role.id, [{ numberId: a, access: "read" }]);
  const aliId = await t.addUser("ali", ROLE.temsilci, [{ numberId: b, access: "write" }]);
  const sup = await t.login("sup");
  return { patron, a, b, chatB, supId, aliId, sup };
};

describe("ekranına geçme: numara erişimi gerçek kişiyle sınırlı", () => {
  test("göremediği numarayı başkasının ekranından da göremez", async () => {
    const { sup, aliId, chatB } = await prepare(["impersonate.view", "impersonate.send", "messages.send", "chats.start"]);
    expect((await sup("GET", `/api/chats/${chatB}/messages`)).status).toBe(404);
    expect((await sup("POST", "/api/auth/impersonate", { userId: aliId })).status).toBe(200);
    expect((await sup("GET", "/api/numbers")).json.numbers).toEqual([]);
    expect((await sup("GET", `/api/chats/${chatB}/messages`)).status).toBe(404);
    expect((await sup("POST", `/api/chats/${chatB}/messages`, { text: "x" })).status).toBe(404);
    expect((await sup("GET", "/api/search?q=gizli")).json.results).toEqual([]);
  });

  test("ortak numarada erişim ikisinin düşüğüdür", async () => {
    const { patron, sup, aliId, b, chatB } = await prepare(["impersonate.view", "impersonate.send", "messages.send", "chats.start"]);
    const supId = (await sup("GET", "/api/auth/me")).json.user.id;
    await patron("PUT", `/api/users/${supId}`, { numbers: [{ numberId: b, access: "read" }] });
    await sup("POST", "/api/auth/impersonate", { userId: aliId });
    expect((await sup("GET", "/api/numbers")).json.numbers.map((n: any) => [n.label, n.access])).toEqual([["B", "read"]]);
    expect((await sup("POST", `/api/chats/${chatB}/messages`, { text: "x" })).status).toBe(403);
  });
});

describe("canlı akış ve push yetkiden düşer", () => {
  test("ekranına geçen kişinin akışı, hesabı kapatılınca veri almaz", async () => {
    const { patron, sup, supId, aliId, b } = await prepare(["impersonate.view", "messages.send", "chats.start", "numbers.view_all"]);
    await sup("POST", "/api/auth/impersonate", { userId: aliId });
    // Akışı uygulama üzerinden aç (gerçek SSE yolu).
    const cookie = await sessionCookieAfterImpersonate("sup", aliId);
    const res = await t.app.request("/api/events", { headers: { cookie } });
    const reader = res.body!.getReader();
    const read = async () => new TextDecoder().decode((await reader.read()).value);
    expect(await read()).toContain("bağlandı");

    await t.inbound(patron, b, "905320000001", "Gizli", "kapatılmadan önce");
    expect(await read()).toContain("kapatılmadan önce");

    await patron("PUT", `/api/users/${supId}`, { active: false });
    await t.inbound(patron, b, "905320000001", "Gizli", "kapatıldıktan sonra");
    const after = await Promise.race([read(), new Promise<string>((r) => setTimeout(() => r("(sessiz)"), 100))]);
    expect(after).not.toContain("kapatıldıktan sonra");
    await reader.cancel().catch(() => {});
  });

  test("ekranına geçmişken push açılamaz; abonelik endpoint ile her zaman silinir; bilinmeyen servis reddedilir", async () => {
    const { sup, aliId } = await prepare(["impersonate.view", "messages.send", "chats.start"]);
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" } };
    expect((await sup("POST", "/api/push/subscribe", { ...sub, endpoint: "https://10.0.0.5:8443/x" })).status).toBe(400);
    expect((await sup("POST", "/api/push/subscribe", sub)).status).toBe(200);
    await sup("POST", "/api/auth/impersonate", { userId: aliId });
    expect((await sup("POST", "/api/push/subscribe", sub)).status).toBe(403);
    await sup("POST", "/api/auth/impersonate/stop");
    await sup("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
    expect(t.db.query("SELECT COUNT(*) AS n FROM push_subscriptions").get()).toEqual({ n: 0 });
  });
});

describe("yetki dağıtma", () => {
  test("users.manage sahibi kendinde olmayan numara erişimini veremez, kendine de", async () => {
    const { patron, b } = await prepare([]);
    const hrRole = (await patron("POST", "/api/roles", { name: "İK", permissions: ["users.manage"] })).json.role;
    const hrId = await t.addUser("hr", hrRole.id);
    const hr = await t.login("hr");
    expect((await hr("PUT", `/api/users/${hrId}`, { numbers: [{ numberId: b, access: "read" }] })).status).toBe(403);
    const created = await hr("POST", "/api/users", {
      username: "yeni",
      name: "Yeni",
      password: PASSWORD,
      roleId: ROLE.salt_okunur,
      numbers: [{ numberId: b, access: "read" }],
    });
    expect(created.status).toBe(403);
    expect((await hr("POST", "/api/users", { username: "yeni", name: "Yeni", password: PASSWORD, roleId: ROLE.salt_okunur })).status).toBe(200);
  });

  test("izleme modunda yönetim işlemleri de kapalı", async () => {
    const { patron, aliId, a } = await prepare([]);
    const role = (
      await patron("POST", "/api/roles", {
        name: "Gözcü",
        permissions: ["impersonate.view", "numbers.view_all", "numbers.manage", "tags.manage", "messages.send", "chats.start"],
      })
    ).json.role;
    await t.addUser("gozcu", role.id);
    const gozcu = await t.login("gozcu");
    // Ali'ye numbers.manage verilmiş özel bir rol yok; Patron'un ekranına da geçemez. Ali'yi yöneticileştir:
    const aliRole = (
      await patron("POST", "/api/roles", { name: "Kıdemli", permissions: ["numbers.manage", "tags.manage", "messages.send", "chats.start"] })
    ).json.role;
    await patron("PUT", `/api/users/${aliId}`, { roleId: aliRole.id, numbers: [{ numberId: a, access: "write" }] });
    const me = (await gozcu("POST", "/api/auth/impersonate", { userId: aliId })).json;
    expect(me.user.permissions).toEqual([]);
    expect((await gozcu("POST", "/api/tags", { name: "x", color: "red" })).status).toBe(403);
    expect((await gozcu("DELETE", `/api/numbers/${a}`)).status).toBe(403);
  });
});

describe("istek ve oturum korumaları", () => {
  test("JSON olmayan gövde 415, başka siteden gelen istek 403, büyük gövde 413", async () => {
    await t.addUser("patron", ROLE.patron);
    const asText = await t.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ username: "patron", password: PASSWORD }),
    });
    expect(asText.status).toBe(415);
    const crossSite = await t.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify({ username: "patron", password: PASSWORD }),
    });
    expect(crossSite.status).toBe(403);
    const otherOrigin = await t.app.request("http://panel.local/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://kotu.example", Host: "panel.local" },
      body: JSON.stringify({ username: "patron", password: PASSWORD }),
    });
    expect(otherOrigin.status).toBe(403);
    const big = await t.app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "x".repeat(2 * 1024 * 1024), password: "y" }),
    });
    expect(big.status).toBe(413);
  });

  test("5 hatalı denemeden sonra kilit; uzun kullanıcı adı kayda kısaltılarak geçer", async () => {
    await t.addUser("patron", ROLE.patron);
    const attempt = (password: string, username = "patron") =>
      t.app.request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    for (let i = 0; i < 5; i++) expect((await attempt("yanlis")).status).toBe(401);
    expect((await attempt(PASSWORD)).status).toBe(429);
    expect((await attempt("x", "a".repeat(81))).status).toBe(400);
    await attempt("x", "b".repeat(80));
    const lengths = t.db
      .query<{ n: number }, []>("SELECT length(target) AS n FROM audit_log WHERE action = 'auth.login_failed'")
      .all()
      .map((r) => r.n);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(40);
  });

  test("şifre değişince diğer oturumlar düşer, değiştiren yönetici oturumda kalır", async () => {
    const patronId = await t.addUser("patron", ROLE.patron);
    const aliId = await t.addUser("ali", ROLE.temsilci);
    const patron = await t.login("patron");
    const otherDevice = await t.login("patron");
    const ali = await t.login("ali");
    await patron("PUT", `/api/users/${aliId}`, { password: "yenisifre1" });
    expect((await ali("GET", "/api/auth/me")).status).toBe(401);
    await patron("PUT", `/api/users/${patronId}`, { password: "yenisifre2" });
    expect((await patron("GET", "/api/auth/me")).status).toBe(200);
    expect((await otherDevice("GET", "/api/auth/me")).status).toBe(401);
  });

  test("CSV virgüllü Excel'de de hücre bölünmez", async () => {
    await t.addUser("patron", ROLE.patron);
    const patron = await t.login("patron");
    const n = await t.addNumber(patron, "A", "905551110001");
    await t.inbound(patron, n, "905320000001", "X", "x,=HYPERLINK(1)");
    const chatId = (await patron("GET", `/api/numbers/${n}/chats`)).json.chats[0].id;
    const res = await t.app.request(`/api/chats/${chatId}/export`, { headers: { cookie: await cookie("patron") } });
    expect(await res.text()).toContain('"x,=HYPERLINK(1)"');
  });
});

// Ham istekler için çerez.
const cookie = async (username: string) => {
  const res = await t.app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  return res.headers.get("set-cookie")!.split(";")[0]!;
};
const sessionCookieAfterImpersonate = async (username: string, userId: number) => {
  const first = await cookie(username);
  const res = await t.app.request("/api/auth/impersonate", {
    method: "POST",
    headers: { cookie: first, "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return res.headers.get("set-cookie")!.split(";")[0]!;
};

void ({} as LiveEvent);
