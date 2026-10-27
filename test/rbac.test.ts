// Rol/izin yönetimi ve "ekranına geç".
import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db/client";
import { ROLE, type TestContext, setup } from "./helpers";

let t: TestContext;
beforeEach(() => {
  t = setup();
});

describe("ekranına geç", () => {
  const prepare = async () => {
    await t.addUser("patron", ROLE.patron);
    const patron = await t.login("patron");
    const satis = await t.addNumber(patron, "Satış", "905551112233");
    const destek = await t.addNumber(patron, "Destek", "905551112244");
    await t.inbound(patron, satis, "905320000001", "Ayşe", "Merhaba");
    const chatId = (await patron("GET", `/api/numbers/${satis}/chats`)).json.chats[0].id as number;
    const aliId = await t.addUser("ali", ROLE.temsilci, [{ numberId: satis, access: "write" }]);
    return { patron, satis, destek, chatId, aliId };
  };

  test("patron Ali'nin ekranına geçer, onun gördüğünü görür ve onun adına yazar", async () => {
    const { patron, chatId, aliId } = await prepare();
    const targets = (await patron("GET", "/api/auth/impersonate/targets")).json.users;
    expect(targets.map((u: any) => u.username)).toEqual(["ali"]);

    const me = await patron("POST", "/api/auth/impersonate", { userId: aliId });
    expect(me.json.actor).toMatchObject({ username: "patron" });
    expect(me.json.user).toMatchObject({ username: "ali" });
    expect(me.json.user.permissions).toEqual(["messages.send", "chats.start"]);

    // Sadece Ali'nin numarası görünür; yönetim kapalı.
    expect((await patron("GET", "/api/numbers")).json.numbers.map((n: any) => n.label)).toEqual(["Satış"]);
    expect((await patron("GET", "/api/users")).status).toBe(403);
    expect((await patron("GET", "/api/auth/me")).json.actor.username).toBe("patron");

    // Okundu işareti izlerken değişmez.
    await patron("POST", `/api/chats/${chatId}/read`);
    expect((await patron("GET", `/api/chats/${chatId}`)).json.chat.unread).toBe(1);

    // Ali adına mesaj: sent_by = patron, as_user = ali.
    expect((await patron("POST", `/api/chats/${chatId}/messages`, { text: "Patron yazdı" })).status).toBe(200);
    const last = (await patron("GET", `/api/chats/${chatId}/messages`)).json.messages.at(-1);
    expect(last).toMatchObject({ sent_by_name: "PATRON", as_user_name: "ALI" });
    expect(t.pushes.at(-1)?.body).toBe("PATRON (ALI olarak): Patron yazdı");

    // İç içe geçiş yok; geri dönüş.
    expect((await patron("GET", "/api/auth/impersonate/targets")).status).toBe(200);
    const back = await patron("POST", "/api/auth/impersonate/stop");
    expect(back.json).toMatchObject({ user: { username: "patron" }, actor: null });
    expect((await patron("GET", "/api/numbers")).json.numbers).toHaveLength(2);
    expect((await patron("POST", "/api/auth/impersonate/stop")).status).toBe(400);

    const actions = (await patron("GET", "/api/audit")).json.entries.map((e: any) => [e.action, e.actor_name, e.as_user_name]);
    expect(actions.slice(0, 3)).toEqual([
      ["impersonate.stop", "PATRON", "ALI"],
      ["message.send", "PATRON", "ALI"],
      ["impersonate.start", "PATRON", "ALI"],
    ]);
    // Ali'ye göre filtre: onun ekranında yapılanlar da gelir.
    const forAli = (await patron("GET", `/api/audit?userId=${aliId}`)).json.entries;
    expect(forAli.length).toBe(3);
  });

  test("sadece izleme izni: hedef yazabiliyor olsa da gönderemez", async () => {
    const { patron, chatId, aliId } = await prepare();
    const role = await patron("POST", "/api/roles", {
      name: "Gözetmen",
      permissions: ["numbers.view_all", "messages.send", "chats.start", "impersonate.view"],
    });
    await t.addUser("gozetmen", role.json.role.id);
    const gozetmen = await t.login("gozetmen");
    const me = await gozetmen("POST", "/api/auth/impersonate", { userId: aliId });
    expect(me.json.user.permissions).toEqual([]);
    expect((await gozetmen("GET", "/api/numbers")).json.numbers[0].access).toBe("read");
    const res = await gozetmen("POST", `/api/chats/${chatId}/messages`, { text: "x" });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("İzleme modundasınız, mesaj gönderemezsiniz");
    expect((await gozetmen("GET", `/api/chats/${chatId}/messages`)).status).toBe(200);
  });

  test("izinsiz ya da daha yetkili kullanıcının ekranına geçilemez; izin kalkınca geçiş düşer", async () => {
    const { patron, aliId } = await prepare();
    const ali = await t.login("ali");
    const patronId = (await patron("GET", "/api/auth/me")).json.user.id;
    expect((await ali("POST", "/api/auth/impersonate", { userId: patronId })).status).toBe(403);
    expect((await ali("GET", "/api/auth/impersonate/targets")).status).toBe(403);

    // impersonate.view var ama patronun izinleri onun alt kümesi değil.
    const role = await patron("POST", "/api/roles", { name: "İzleyici", permissions: ["impersonate.view"] });
    const izleyiciId = await t.addUser("izleyici", role.json.role.id);
    const izleyici = await t.login("izleyici");
    expect((await izleyici("POST", "/api/auth/impersonate", { userId: patronId })).status).toBe(403);
    // Ali'nin izinleri (messages.send, chats.start) izleyicide yok → geçemez.
    expect((await izleyici("POST", "/api/auth/impersonate", { userId: aliId })).status).toBe(403);
    expect((await izleyici("GET", "/api/auth/impersonate/targets")).json.users).toEqual([]);
    expect((await patron("POST", "/api/auth/impersonate", { userId: patronId })).status).toBe(403);

    // Geçmişken hedef devre dışı kalırsa kendi hesabına düşer.
    await patron("POST", "/api/auth/impersonate", { userId: aliId });
    const second = await t.login("patron");
    await second("PUT", `/api/users/${aliId}`, { active: false });
    const me = (await patron("GET", "/api/auth/me")).json;
    expect(me).toMatchObject({ user: { username: "patron" }, actor: null });
    void izleyiciId;
  });
});

describe("kullanıcı ve rol yönetimi", () => {
  test("koruma kuralları", async () => {
    const patronId = await t.addUser("patron", ROLE.patron);
    const patron = await t.login("patron");
    const satis = await t.addNumber(patron, "Satış", "905551112233");

    expect((await patron("PUT", `/api/users/${patronId}`, { roleId: ROLE.temsilci })).status).toBe(400);
    expect((await patron("PUT", `/api/users/${patronId}`, { active: false })).status).toBe(400);
    expect((await patron("DELETE", `/api/users/${patronId}`)).status).toBe(400);
    expect((await patron("PUT", `/api/roles/${ROLE.patron}`, { name: "Kral" })).status).toBe(400);
    expect((await patron("DELETE", `/api/roles/${ROLE.temsilci}`)).status).toBe(200);
    expect((await patron("DELETE", `/api/roles/${ROLE.patron}`)).status).toBe(400);

    // Yönetici rolü: kullanıcıları yönetir ama Patron oluşturamaz/düzenleyemez.
    const yonetici = await patron("POST", "/api/roles", {
      name: "Yönetici",
      permissions: ["users.manage", "numbers.view_all", "messages.send", "bilinmeyen"],
    });
    expect(yonetici.json.role.permissions).toEqual(["numbers.view_all", "messages.send", "users.manage"]);
    await t.addUser("mudur", yonetici.json.role.id);
    const mudur = await t.login("mudur");
    const okurId = (
      await mudur("POST", "/api/users", {
        username: "okur",
        name: "Okur",
        password: "secret1",
        roleId: ROLE.salt_okunur,
        numbers: [{ numberId: satis, access: "read" }],
      })
    ).json.user.id;
    expect(okurId).toBeGreaterThan(0);
    const users = (await mudur("GET", "/api/users")).json.users;
    expect(users.find((u: any) => u.username === "okur")).toMatchObject({
      roleName: "Salt okunur",
      active: true,
      numbers: [{ numberId: satis, access: "read" }],
    });
    expect((await mudur("POST", "/api/users", { username: "patron2", name: "P2", password: "secret1", roleId: ROLE.patron })).status).toBe(403);
    expect((await mudur("PUT", `/api/users/${patronId}`, { name: "x" })).status).toBe(403);
    expect((await mudur("DELETE", `/api/users/${patronId}`)).status).toBe(403);
    expect((await mudur("POST", "/api/roles", { name: "Süper", permissions: ["numbers.manage"] })).status).toBe(403);

    // Kullanıcısı olan rol silinemez.
    expect((await patron("DELETE", `/api/roles/${yonetici.json.role.id}`)).status).toBe(400);
    const roles = (await patron("GET", "/api/roles")).json.roles;
    expect(roles[0]).toMatchObject({ name: "Patron", system: true, userCount: 1 });
    expect((await patron("GET", "/api/permissions")).json.permissions.length).toBe(13);
  });
});

describe("veritabanı geçişi", () => {
  test("sürüm 1 veritabanı (sabit roller) yeni modele taşınır", () => {
    const dir = mkdtempSync(join(tmpdir(), "panel-"));
    const path = join(dir, "old.db");
    try {
      const old = new Database(path, { create: true });
      old.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('patron','temsilci','salt_okunur')), created_at INTEGER NOT NULL);
        CREATE TABLE numbers (id INTEGER PRIMARY KEY, label TEXT NOT NULL, phone TEXT NOT NULL, session TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'STOPPED', me_id TEXT, created_at INTEGER NOT NULL);
        CREATE TABLE user_numbers (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          number_id INTEGER NOT NULL REFERENCES numbers(id) ON DELETE CASCADE, PRIMARY KEY (user_id, number_id));
        INSERT INTO users VALUES (1,'p','P','h','patron',1),(2,'t','T','h','temsilci',1),(3,'s','S','h','salt_okunur',1);
        INSERT INTO numbers VALUES (1,'Satış','905551112233','n1','WORKING',NULL,1);
        INSERT INTO user_numbers VALUES (2,1),(3,1);
      `);
      old.close();

      const db = openDatabase(path);
      expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 5 });
      expect(db.query("SELECT id, role_id, active FROM users ORDER BY id").all()).toEqual([
        { id: 1, role_id: 1, active: 1 },
        { id: 2, role_id: 2, active: 1 },
        { id: 3, role_id: 3, active: 1 },
      ]);
      expect(db.query("SELECT user_id, access FROM user_numbers ORDER BY user_id").all()).toEqual([
        { user_id: 2, access: "write" },
        { user_id: 3, access: "read" },
      ]);
      // Yabancı anahtarlar yeni users tablosunu gösteriyor: kullanıcı silinince ataması da gider.
      db.query("DELETE FROM users WHERE id = 3").run();
      expect(db.query("SELECT COUNT(*) AS n FROM user_numbers").get()).toEqual({ n: 1 });
      db.close();
      // İkinci açılış bir şey yapmaz.
      openDatabase(path).close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows: WAL dosyası kilitli kalabilir; geçici klasör sonra temizlenir.
      }
    }
  });
});
