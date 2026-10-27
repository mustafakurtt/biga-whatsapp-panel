// Sohbet ve mesaj tabloları.
import type { Database } from "../../db/client";
import type { ChatRow, MessageRow, MessageSource } from "../../shared/types";

export type MessageView = MessageRow & { sent_by_name: string | null };

const PAGE_SIZE = 100;

type NewMessage = {
  chatId: number;
  providerId: string | null;
  direction: "in" | "out";
  source: MessageSource;
  sentBy: number | null;
  body: string;
  ts: number;
};

export const createChatsRepository = (db: Database) => {
  const get = (id: number): ChatRow | null => db.query<ChatRow, [number]>("SELECT * FROM chats WHERE id = ?").get(id);

  return {
    get,
    listByNumber: (numberId: number): ChatRow[] =>
      db
        .query<ChatRow, [number]>("SELECT * FROM chats WHERE number_id = ? ORDER BY last_message_at DESC, id DESC")
        .all(numberId),

    // Sohbet yoksa oluşturur. Kişi adı geldiyse günceller.
    findOrCreate: (numberId: number, remoteId: string, name: string | null, fallbackName: string): ChatRow => {
      const row = db
        .query<ChatRow, [number, string, string]>(
          `INSERT INTO chats (number_id, remote_id, name) VALUES (?, ?, ?)
           ON CONFLICT (number_id, remote_id) DO UPDATE SET name = name
           RETURNING *`,
        )
        .get(numberId, remoteId, name ?? fallbackName)!;
      if (name && row.name !== name) {
        db.query("UPDATE chats SET name = ? WHERE id = ?").run(name, row.id);
        return { ...row, name };
      }
      return row;
    },

    // Aynı sağlayıcı kimliği daha önce kaydedildiyse null döner (tekrar gelen olay).
    insertMessage: (m: NewMessage): number | null =>
      db
        .query<{ id: number }, [number, string | null, string, string, number | null, string, number]>(
          `INSERT OR IGNORE INTO messages (chat_id, provider_id, direction, source, sent_by, body, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(m.chatId, m.providerId, m.direction, m.source, m.sentBy, m.body, m.ts)?.id ?? null,

    // Son mesaj bilgisini ve okunmamış sayısını günceller (geç gelen eski mesaj son mesajı ezmez).
    touch: (chatId: number, body: string, ts: number, incoming: boolean): ChatRow => {
      db.query(
        `UPDATE chats SET
           last_text = CASE WHEN ?1 >= last_message_at THEN ?2 ELSE last_text END,
           last_message_at = MAX(last_message_at, ?1),
           unread = unread + ?3
         WHERE id = ?4`,
      ).run(ts, body, incoming ? 1 : 0, chatId);
      return get(chatId)!;
    },

    markRead: (chatId: number) => db.query("UPDATE chats SET unread = 0 WHERE id = ?").run(chatId),

    message: (id: number): MessageView | null =>
      db
        .query<MessageView, [number]>(
          "SELECT m.*, u.name AS sent_by_name FROM messages m LEFT JOIN users u ON u.id = m.sent_by WHERE m.id = ?",
        )
        .get(id),

    // Eskiden yeniye, en fazla 100. `before` verilirse o andan önceki sayfa.
    messages: (chatId: number, before?: number): MessageView[] =>
      db
        .query<MessageView, [number, number, number]>(
          `SELECT m.*, u.name AS sent_by_name FROM messages m LEFT JOIN users u ON u.id = m.sent_by
           WHERE m.chat_id = ? AND m.ts < ? ORDER BY m.ts DESC, m.id DESC LIMIT ?`,
        )
        .all(chatId, before ?? Number.MAX_SAFE_INTEGER, PAGE_SIZE)
        .reverse(),
  };
};

export type ChatsRepository = ReturnType<typeof createChatsRepository>;
