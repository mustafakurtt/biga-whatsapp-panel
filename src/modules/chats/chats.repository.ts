// Sohbet ve mesaj tabloları.
import type { Database } from "../../db/client";
import { cleanName, displayFromRemote } from "../../shared/phone";
import type { ChatRow, ChatStatus, MessageSource, MessageView, Note } from "../../shared/types";

export type { MessageView };

const PAGE_SIZE = 100;
const SEARCH_LIMIT = 50;

const CHAT_SELECT = `SELECT c.*, a.name AS assigned_name,
  (SELECT group_concat(t.tag_id) FROM chat_tags t WHERE t.chat_id = c.id) AS tag_list
  FROM chats c LEFT JOIN users a ON a.id = c.assigned_to`;

type RawChat = Omit<ChatRow, "tags"> & { tag_list: string | null };
const toChat = ({ tag_list, ...rest }: RawChat): ChatRow => ({
  ...rest,
  // "." gibi anlamsız bir ad kayıtlıysa (eski kayıtlar dahil) numara gösterilir.
  name: cleanName(rest.name) ?? displayFromRemote(rest.remote_id),
  tags: tag_list ? tag_list.split(",").map(Number).sort((a, b) => a - b) : [],
});
const toChatOrNull = (row: RawChat | null) => (row ? toChat(row) : null);
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
  const get = (id: number): ChatRow | null =>
    toChatOrNull(db.query<RawChat, [number]>(`${CHAT_SELECT} WHERE c.id = ?`).get(id));

  return {
    get,

    listByNumber: (
      numberId: number,
      opts: { filter?: ChatFilter; q?: string; userId?: number; status?: ChatStatus; tagId?: number } = {},
    ): ChatRow[] => {
      const where = ["c.number_id = ?"];
      const params: (string | number)[] = [numberId];
      if (opts.filter === "unread") where.push("c.unread > 0");
      if (opts.filter === "unassigned") where.push("c.assigned_to IS NULL");
      if (opts.filter === "mine") {
        where.push("c.assigned_to = ?");
        params.push(opts.userId ?? 0);
      }
      if (opts.status) {
        where.push("c.status = ?");
        params.push(opts.status);
      }
      if (opts.tagId) {
        where.push("EXISTS (SELECT 1 FROM chat_tags t WHERE t.chat_id = c.id AND t.tag_id = ?)");
        params.push(opts.tagId);
      }
      if (opts.q) {
        where.push("(c.name LIKE ? ESCAPE '\\' OR c.remote_id LIKE ? ESCAPE '\\' OR c.last_text LIKE ? ESCAPE '\\')");
        const p = likePattern(opts.q);
        params.push(p, p, p);
      }
      return db
        .query<RawChat, (string | number)[]>(
          `${CHAT_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.last_message_at DESC, c.id DESC LIMIT 500`,
        )
        .all(...params)
        .map(toChat);
    },

    findByRemote: (numberId: number, remoteId: string): ChatRow | null =>
      toChatOrNull(
        db.query<RawChat, [number, string]>(`${CHAT_SELECT} WHERE c.number_id = ? AND c.remote_id = ?`).get(numberId, remoteId),
      ),

    // Numara başına okunmamış toplamı.
    unreadByNumber: (): Map<number, number> =>
      new Map(
        db
          .query<{ number_id: number; n: number }, []>("SELECT number_id, SUM(unread) AS n FROM chats GROUP BY number_id")
          .all()
          .map((r) => [r.number_id, r.n]),
      ),

    // Sohbet yoksa oluşturur. Ad önceliği: rehberdeki ad → kişinin profil adı → numara.
    // Rehberde adı olan kişinin profil adı sohbet adını ezmez.
    findOrCreate: (numberId: number, remoteId: string, name: string | null, fallbackName: string): ChatRow => {
      const saved = db
        .query<{ name: string }, [number, string]>("SELECT name FROM contacts WHERE number_id = ? AND remote_id = ?")
        .get(numberId, remoteId)?.name;
      const best = saved ?? cleanName(name);
      const { id } = db
        .query<{ id: number; name: string }, [number, string, string]>(
          `INSERT INTO chats (number_id, remote_id, name) VALUES (?, ?, ?)
           ON CONFLICT (number_id, remote_id) DO UPDATE SET name = name
           RETURNING id`,
        )
        .get(numberId, remoteId, best ?? fallbackName)!;
      if (best) db.query("UPDATE chats SET name = ? WHERE id = ? AND name != ?").run(best, id, best);
      return get(id)!;
    },

    // Rehber adlarını kaydeder ve var olan sohbetlerin adını günceller. Adı değişen sohbet sayısını döner.
    saveContacts: (numberId: number, contacts: { remoteId: string; name: string }[]): number =>
      db.transaction(() => {
        const upsert = db.query(
          `INSERT INTO contacts (number_id, remote_id, name) VALUES (?, ?, ?)
           ON CONFLICT (number_id, remote_id) DO UPDATE SET name = excluded.name`,
        );
        const rename = db.query("UPDATE chats SET name = ? WHERE number_id = ? AND remote_id = ? AND name != ?");
        let changed = 0;
        for (const c of contacts) {
          upsert.run(numberId, c.remoteId, c.name);
          changed += rename.run(c.name, numberId, c.remoteId, c.name).changes;
        }
        return changed;
      })(),

    // Aynı sağlayıcı kimliği daha önce kaydedildiyse null döner (tekrar gelen olay).
    insertMessage: (m: NewMessage): number | null =>
      db
        .query<{ id: number }, [number, string | null, string, string, number | null, number | null, string, number]>(
          `INSERT OR IGNORE INTO messages (chat_id, provider_id, direction, source, sent_by, as_user, body, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(m.chatId, m.providerId, m.direction, m.source, m.sentBy, m.asUser, m.body, m.ts)?.id ?? null,

    // Son mesaj bilgisini ve okunmamış sayısını günceller (geç gelen eski mesaj son mesajı ezmez).
    // incoming (yeni gelen müşteri mesajı): okunmamış +1 ve kapalı sohbet yeniden açılır.
    // Geçmişten içe aktarılan mesajlarda incoming=false verilir: yalnızca son mesaj bilgisi güncellenir.
    touch: (chatId: number, body: string, ts: number, incoming: boolean): ChatRow => {
      db.query(
        `UPDATE chats SET
           last_text = CASE WHEN ?1 >= last_message_at THEN ?2 ELSE last_text END,
           last_message_at = MAX(last_message_at, ?1),
           unread = unread + ?3,
           status = CASE WHEN ?3 = 1 THEN 'open' ELSE status END
         WHERE id = ?4`,
      ).run(ts, body, incoming ? 1 : 0, chatId);
      return get(chatId)!;
    },

    // Sohbette verilen andan yeni mesaj sayısı (geçmiş içe aktarma sınırı için).
    countNewer: (chatId: number, ts: number): number =>
      db.query<{ n: number }, [number, number]>("SELECT COUNT(*) AS n FROM messages WHERE chat_id = ? AND ts > ?").get(chatId, ts)!.n,

    markRead: (chatId: number) => db.query("UPDATE chats SET unread = 0 WHERE id = ?").run(chatId),
    assign: (chatId: number, userId: number | null) =>
      db.query("UPDATE chats SET assigned_to = ? WHERE id = ?").run(userId, chatId),
    setStatus: (chatId: number, status: ChatStatus) => db.query("UPDATE chats SET status = ? WHERE id = ?").run(status, chatId),
    // Var olmayan etiket kimlikleri yok sayılır.
    setTags: (chatId: number, tagIds: number[]) =>
      db.transaction(() => {
        db.query("DELETE FROM chat_tags WHERE chat_id = ?").run(chatId);
        const insert = db.query("INSERT OR IGNORE INTO chat_tags (chat_id, tag_id) SELECT ?, id FROM tags WHERE id = ?");
        for (const id of new Set(tagIds)) insert.run(chatId, id);
      })(),

    notes: (chatId: number): Note[] =>
      db.query<Note, [number]>("SELECT * FROM chat_notes WHERE chat_id = ? ORDER BY ts, id").all(chatId),
    note: (id: number): Note | null => db.query<Note, [number]>("SELECT * FROM chat_notes WHERE id = ?").get(id),
    addNote: (n: { chatId: number; userId: number; userName: string; asUserName: string | null; body: string }): Note =>
      db
        .query<Note, [number, number, string, string | null, string, number]>(
          `INSERT INTO chat_notes (chat_id, user_id, user_name, as_user_name, body, ts) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
        )
        .get(n.chatId, n.userId, n.userName, n.asUserName, n.body, Date.now())!,
    deleteNote: (id: number) => db.query("DELETE FROM chat_notes WHERE id = ?").run(id),

    message: (id: number): MessageView | null => db.query<MessageView, [number]>(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id),

    // Eskiden yeniye, en fazla 100. `before` verilirse o andan önceki sayfa.
    messages: (chatId: number, before?: number): MessageView[] =>
      db
        .query<MessageView, [number, number, number]>(
          `${MESSAGE_SELECT} WHERE m.chat_id = ? AND m.ts < ? ORDER BY m.ts DESC, m.id DESC LIMIT ?`,
        )
        .all(chatId, before ?? Number.MAX_SAFE_INTEGER, PAGE_SIZE)
        .reverse(),

    // Dışa aktarma için tüm mesajlar (eski→yeni).
    allMessages: (chatId: number): MessageView[] =>
      db.query<MessageView, [number]>(`${MESSAGE_SELECT} WHERE m.chat_id = ? ORDER BY m.ts, m.id LIMIT 50000`).all(chatId),

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
