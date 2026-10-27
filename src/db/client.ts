// SQLite bağlantısı ve şema. Demo için göç aracı yok: tablolar yoksa oluşturulur.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
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

export const openDatabase = (path: string): Database => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
};

export type { Database };
