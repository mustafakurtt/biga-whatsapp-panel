// Sorgu önbelleğini yerinde güncelleyen yardımcılar (canlı olaylar ve iyimser değişiklikler için).
import type { QueryClient } from "@tanstack/react-query";
import { qk, type MessagesPage } from "./queries";
import type { ChatQuery, ChatRow, MessageView, Note, NumberView } from "./types";

export function chatMatches(chat: ChatRow, q: ChatQuery, meId: number): boolean {
  if (q.status !== "all" && (chat.status ?? "open") !== q.status) return false;
  if (q.tag !== null && !(chat.tags ?? []).includes(q.tag)) return false;
  switch (q.filter) {
    case "unread":
      return chat.unread > 0;
    case "mine":
      return chat.assigned_to === meId;
    case "unassigned":
      return !chat.assigned_to;
    default:
      return true;
  }
}

/** Sohbeti tüm önbellekli listelerde günceller / ekler. moveTop: yeni mesajla en üste. keepId: süzgece uymasa da listede kalsın (açık sohbet). */
export function upsertChat(qc: QueryClient, chat: ChatRow, opts: { moveTop?: boolean; meId: number; keepId?: number | null }): void {
  qc.setQueryData(qk.chat(chat.id), chat);
  for (const [key, list] of qc.getQueriesData<ChatRow[]>({ queryKey: qk.chatsOf(chat.number_id) })) {
    if (!list) continue;
    const q = key[2] as ChatQuery | undefined;
    if (!q) continue;
    const idx = list.findIndex((c) => c.id === chat.id);
    const fits = chatMatches(chat, q, opts.meId);
    let next: ChatRow[] | null = null;
    if (idx >= 0) {
      if (!fits && chat.id !== opts.keepId) next = list.filter((c) => c.id !== chat.id);
      else if (opts.moveTop) next = [chat, ...list.filter((c) => c.id !== chat.id)];
      else next = list.map((c) => (c.id === chat.id ? chat : c));
    } else if (fits && !q.q) {
      next = [chat, ...list];
    }
    if (next) qc.setQueryData(key, next);
  }
}

/** Önbellekte bilinen okunmamış sayısı (yoksa null) */
export function knownUnread(qc: QueryClient, chatId: number, numberId: number): number | null {
  const one = qc.getQueryData<ChatRow>(qk.chat(chatId));
  if (one) return one.unread ?? 0;
  for (const [, list] of qc.getQueriesData<ChatRow[]>({ queryKey: qk.chatsOf(numberId) })) {
    const c = list?.find((x) => x.id === chatId);
    if (c) return c.unread ?? 0;
  }
  return null;
}

export function adjustNumberUnread(qc: QueryClient, numberId: number, delta: number): void {
  if (!delta) return;
  qc.setQueryData<NumberView[]>(qk.numbers, (list) =>
    list?.map((n) => (n.id === numberId ? { ...n, unread: Math.max(0, (n.unread ?? 0) + delta) } : n)),
  );
}

export function appendMessage(qc: QueryClient, m: MessageView): void {
  qc.setQueryData<MessagesPage>(qk.messages(m.chat_id), (page) => {
    if (!page) return page; // sohbet hiç açılmadıysa önbelleğe yazmaya gerek yok
    if (page.messages.some((x) => x.id === m.id)) return page;
    const messages = [...page.messages, m].sort((a, b) => a.ts - b.ts || a.id - b.id);
    return { ...page, messages };
  });
}

export function upsertNote(qc: QueryClient, chatId: number, note: Note): void {
  qc.setQueryData<Note[]>(qk.notes(chatId), (list) => {
    if (!list) return list;
    if (list.some((n) => n.id === note.id)) return list;
    return [...list, note].sort((a, b) => a.ts - b.ts || a.id - b.id);
  });
}

export function removeNote(qc: QueryClient, chatId: number, noteId: number): void {
  qc.setQueryData<Note[]>(qk.notes(chatId), (list) => list?.filter((n) => n.id !== noteId));
}

/** Sohbet güncellendi (atama, okundu, durum, etiket): okunmamış farkını numaraya yansıtır. */
export function applyChatUpdate(qc: QueryClient, chat: ChatRow, meId: number, opts: { moveTop?: boolean; incoming?: boolean; keepId?: number | null } = {}): void {
  const prev = knownUnread(qc, chat.id, chat.number_id);
  if (prev === null) {
    if (opts.incoming) adjustNumberUnread(qc, chat.number_id, 1);
  } else {
    adjustNumberUnread(qc, chat.number_id, (chat.unread ?? 0) - prev);
  }
  upsertChat(qc, chat, { moveTop: opts.moveTop, meId, keepId: opts.keepId });
}
