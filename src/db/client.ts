// SQLite bağlantısı ve şema. Sürüm `PRAGMA user_version` ile tutulur; eksik adımlar açılışta sırayla uygulanır.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Sürüm 1: ilk şema (sabit roller).
const V1 = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('patron','temsilci','salt_okunur')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS numbers (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  phone TEXT NOT NULL,
  session TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'STOPPED',
  me_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_numbers (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number_id INTEGER NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, number_id)
);
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY,
  number_id INTEGER NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  remote_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_text TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 0,
  UNIQUE (number_id, remote_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  provider_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  source TEXT NOT NULL CHECK (source IN ('contact','phone','panel')),
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat_ts ON messages (chat_id, ts);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
`;

// Sürüm 2: roller ve izinler, numara başına erişim seviyesi, hesap durumu, ekranına geçme,
// sohbet atama, etkinlik kaydı, hazır yanıtlar.
const V2 = (now: number) => `
CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  permissions TEXT NOT NULL DEFAULT '[]',
  system INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
INSERT INTO roles (id, name, permissions, system, created_at) VALUES
  (1, 'Patron', '["*"]', 1, ${now}),
  (2, 'Temsilci', '["messages.send","chats.start"]', 0, ${now}),
  (3, 'Salt okunur', '[]', 0, ${now});

CREATE TABLE users_v2 (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);
INSERT INTO users_v2 (id, username, name, password_hash, role_id, created_at)
  SELECT id, username, name, password_hash,
         CASE role WHEN 'patron' THEN 1 WHEN 'temsilci' THEN 2 ELSE 3 END, created_at
  FROM users;
DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;

ALTER TABLE user_numbers ADD COLUMN access TEXT NOT NULL DEFAULT 'write' CHECK (access IN ('read','write'));
UPDATE user_numbers SET access = 'read' WHERE user_id IN (SELECT id FROM users WHERE role_id = 3);

ALTER TABLE messages ADD COLUMN as_user INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE chats ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX messages_ts ON messages (ts);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor_id INTEGER,
  actor_name TEXT,
  as_user_id INTEGER,
  as_user_name TEXT,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT
);
CREATE INDEX audit_log_actor ON audit_log (actor_id, id);

CREATE TABLE quick_replies (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
`;

// Sürüm 3: sohbet durumu (açık/kapalı), etiketler, ekip içi notlar.
const V3 = () => `
ALTER TABLE chats ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'));

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT 'gray'
);
CREATE TABLE chat_tags (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, tag_id)
);
CREATE INDEX chat_tags_tag ON chat_tags (tag_id);

CREATE TABLE chat_notes (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  as_user_name TEXT,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX chat_notes_chat ON chat_notes (chat_id, ts);
`;

// Sürüm 4: numara türü (gerçek WhatsApp ya da test) — ikisi aynı panelde.
const V4 = () => `
ALTER TABLE numbers ADD COLUMN provider TEXT NOT NULL DEFAULT 'baileys' CHECK (provider IN ('baileys','mock'));
`;

// Sürüm 5: token sürümü (şifre değişince eski oturumlar geçersiz olur).
const V5 = () => `
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
`;

// Sürüm 6: telefon rehberindeki kişi adları (numara başına). Sohbet adında profil adından önceliklidir.
const V6 = () => `
CREATE TABLE contacts (
  number_id INTEGER NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  remote_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (number_id, remote_id)
);
`;

// Sürüm 7: etkinlik kaydında numara kimliği (yabancı anahtar yok: numara silinse de kayıt kalır).
// Eski kayıtlarda NULL'dır ve herkese açık numarasız kayıt gibi davranır.
const V7 = () => `
ALTER TABLE audit_log ADD COLUMN number_id INTEGER;
CREATE INDEX audit_log_number ON audit_log (number_id, id);
`;

// Sürüm 8: mesaj kimliği tüm tabloda değil sohbet başına tekil. WhatsApp aynı mesaja gönderen ve alan tarafta
// aynı kimliği verir; iki panel numarası birbirine yazınca alan taraftaki kayıt atlanıyordu.
// Ayrıca çıkışta iptal edilen oturumlar (süreleri dolunca temizlenir).
const V8 = () => `
CREATE TABLE messages_v8 (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  provider_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  source TEXT NOT NULL CHECK (source IN ('contact','phone','panel')),
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL,
  as_user INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (chat_id, provider_id)
);
INSERT INTO messages_v8 (id, chat_id, provider_id, direction, source, sent_by, body, ts, as_user)
  SELECT id, chat_id, provider_id, direction, source, sent_by, body, ts, as_user FROM messages;
DROP TABLE messages;
ALTER TABLE messages_v8 RENAME TO messages;
CREATE INDEX messages_chat_ts ON messages (chat_id, ts);
CREATE INDEX messages_ts ON messages (ts);

CREATE TABLE revoked_sessions (
  jti TEXT PRIMARY KEY,
  exp INTEGER NOT NULL
);
`;

const MIGRATIONS: ((now: number) => string)[] = [() => V1, V2, V3, V4, V5, V6, V7, V8];

const migrate = (db: Database) => {
  const current = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
  if (current >= MIGRATIONS.length) return;
  // Tablo yeniden kurulurken yabancı anahtar denetimi kapalı olmalı (işlem dışında değiştirilebilir).
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.transaction(() => {
      for (let version = current; version < MIGRATIONS.length; version++) {
        db.exec(MIGRATIONS[version]!(Date.now()));
      }
      db.exec(`PRAGMA user_version = ${MIGRATIONS.length};`);
    })();
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
  const broken = db.query("PRAGMA foreign_key_check").all();
  if (broken.length > 0) throw new Error(`Veritabanı geçişi sonrası bozuk yabancı anahtar: ${JSON.stringify(broken)}`);
};

export const openDatabase = (path: string): Database => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
};

export type { Database };
