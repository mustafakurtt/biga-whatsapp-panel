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

const MIGRATIONS: ((now: number) => string)[] = [() => V1, V2];

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
