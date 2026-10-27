// Sohbet ve mesaj tabloları.
import type { Database } from "../../db/client";
import type { ChatRow, MessageSource, MessageView } from "../../shared/types";

export type { MessageView };

const PAGE_SIZE = 100;
const SEARCH_LIMIT = 50;

const CHAT_SELECT = "SELECT c.*, a.name AS assigned_name FROM chats c LEFT JOIN users a ON a.id = c.assigned_to";
const MESSAGE_SELECT = `SELECT m.*, u.name AS sent_by_name, v.name AS as_user_name FROM messages m
  LEFT JOIN users u ON u.id = m.sent_by LEFT JOIN users v ON v.id = m.as_user`;

export type ChatFilter = "all" | "unread" | "mine" | "unassigned";

type NewMessage = {
  chatId: number;
  providerId: string | null;
  direction: "in" | "out";
  source: MessageSource;
  sentBy: number | null;
  asUser: number | null;
  body: string;
  ts: number;
};

// LIKE içindeki % ve _ karakterleri düz metin sayılsın.
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

export const createChatsRepository = (db: Database) => {
  const get = (id: number): ChatRow | null => db.query<ChatRow, [number]>(`${CHAT_SELECT} WHERE c.id = ?`).get(id);

  return {
    get,

    listByNumber: (numberId: number, opts: { filter?: ChatFilter; q?: string; userId?: number } = {}): ChatRow[] => {
      const where = ["c.number_id = ?"];
      const params: (string | number)[] = [numberId];
      if (opts.filter === "unread") where.push("c.unread > 0");
      if (opts.filter === "unassigned") where.push("c.assigned_to IS NULL");
      if (opts.filter === "mine") {
        where.push("c.assigned_to = ?");
        params.push(opts.userId ?? 0);
      }
      if (opts.q) {
        where.push("(c.name LIKE ? ESCAPE '\\' OR c.remote_id LIKE ? ESCAPE '\\' OR c.last_text LIKE ? ESCAPE '\\')");
        const p = likePattern(opts.q);
        params.push(p, p, p);
      }
      return db
        .query<ChatRow, (string | number)[]>(
          `${CHAT_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.last_message_at DESC, c.id DESC`,
        )
        .all(...params);
    },

    // Numara başına okunmamış toplamı.
    unreadByNumber: (): Map<number, number> =>
      new Map(
        db
          .query<{ number_id: number; n: number }, []>("SELECT number_id, SUM(unread) AS n FROM chats GROUP BY number_id")
          .all()
          .map((r) => [r.number_id, r.n]),
      ),

    // Sohbet yoksa oluşturur. Kişi adı geldiyse günceller.
    findOrCreate: (numberId: number, remoteId: string, name: string | null, fallbackName: string): ChatRow => {
      const { id } = db
        .query<{ id: number; name: string }, [number, string, string]>(
          `INSERT INTO chats (number_id, remote_id, name) VALUES (?, ?, ?)
           ON CONFLICT (number_id, remote_id) DO UPDATE SET name = name
           RETURNING id`,
        )
        .get(numberId, remoteId, name ?? fallbackName)!;
      if (name) db.query("UPDATE chats SET name = ? WHERE id = ? AND name != ?").run(name, id, name);
      return get(id)!;
    },

    // Aynı sağlayıcı kimliği daha önce kaydedildiyse null döner (tekrar gelen olay).
    insertMessage: (m: NewMessage): number | null =>
      db
        .query<{ id: number }, [number, string | null, string, string, number | null, number | null, string, number]>(
          `INSERT OR IGNORE INTO messages (chat_id, provider_id, direction, source, sent_by, as_user, body, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(m.chatId, m.providerId, m.direction, m.source, m.sentBy, m.asUser, m.body, m.ts)?.id ?? null,

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
    assign: (chatId: number, userId: number | null) =>
      db.query("UPDATE chats SET assigned_to = ? WHERE id = ?").run(userId, chatId),

    message: (id: number): MessageView | null => db.query<MessageView, [number]>(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id),

    // Eskiden yeniye, en fazla 100. `before` verilirse o andan önceki sayfa.
    messages: (chatId: number, before?: number): MessageView[] =>
      db
        .query<MessageView, [number, number, number]>(
          `${MESSAGE_SELECT} WHERE m.chat_id = ? AND m.ts < ? ORDER BY m.ts DESC, m.id DESC LIMIT ?`,
        )
        .all(chatId, before ?? Number.MAX_SAFE_INTEGER, PAGE_SIZE)
        .reverse(),

    // Verilen numaralarda mesaj metninde arama, en yeni 50.
    search: (numberIds: number[], q: string): { message: MessageView; chatId: number }[] => {
      if (numberIds.length === 0) return [];
      const marks = numberIds.map(() => "?").join(",");
      return db
        .query<MessageView, (string | number)[]>(
          `${MESSAGE_SELECT} JOIN chats c ON c.id = m.chat_id
           WHERE c.number_id IN (${marks}) AND m.body LIKE ? ESCAPE '\\'
           ORDER BY m.ts DESC LIMIT ${SEARCH_LIMIT}`,
        )
        .all(...numberIds, likePattern(q))
        .map((message) => ({ message, chatId: message.chat_id }));
    },
  };
};

export type ChatsRepository = ReturnType<typeof createChatsRepository>;
