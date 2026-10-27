// Mesajların tek giriş noktası: kaydeder, canlı akışa yayar, push bildirimi gönderir.
import type { Logger } from "@mustafakurtt/hono-core/logger";
import type { Database } from "../../db/client";
import type { InboundEvent, InboundMessage, LiveHub, MessageService, Notifier } from "../../shared/contracts";
import { cleanName, displayFromRemote } from "../../shared/phone";
import type { ChatRow, NumberRow } from "../../shared/types";
import { type MessageView, createChatsRepository } from "../chats/chats.repository";
import { createNumbersRepository } from "../numbers/numbers.repository";

const PREVIEW_LENGTH = 140;
const preview = (text: string) => (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text);
// Geçmiş eşitlemesinde her sohbetten içe aktarılan en yeni mesaj sayısı.
export const HISTORY_PER_CHAT = 5;

export const createMessageService = (deps: {
  db: Database;
  hub: LiveHub;
  notifier: Notifier;
  logger: Logger;
}): MessageService => {
  const { hub, notifier, logger } = deps;
  const numbers = createNumbersRepository(deps.db);
  const chats = createChatsRepository(deps.db);

  // "Kim kime ne yazdı" bildirimi. Gönderen panel kullanıcısının kendisine gitmez.
  const announce = (number: NumberRow, chat: ChatRow, message: MessageView) => {
    hub.publish(number.id, { type: "message", numberId: number.id, chat, message });

    const title =
      message.source === "contact" ? `${chat.name} · ${number.label}` : `${number.label} → ${chat.name}`;
    const who =
      message.source !== "panel"
        ? "Telefondan"
        : message.as_user_name
          ? `${message.sent_by_name ?? "Panel"} (${message.as_user_name} olarak)`
          : (message.sent_by_name ?? "Panel");
    const body = message.source === "contact" ? preview(message.body) : `${who}: ${preview(message.body)}`;
    notifier
      .notifyNumber(number.id, { title, body, url: `/?chat=${chat.id}` }, message.sent_by ?? undefined)
      .catch((err) => logger.warn({ err }, "push gönderilemedi"));
  };

  // Mesajı kaydeder. quiet (geçmişten içe aktarma): okunmamış sayılmaz, sohbet yeniden açılmaz,
  // canlı mesaj olayı ve bildirim gönderilmez. Yeni kaydedildiyse true.
  const save = (
    number: NumberRow,
    chat: ChatRow,
    m: {
      providerId: string | null;
      source: MessageView["source"];
      sentBy: number | null;
      asUser: number | null;
      body: string;
      ts: number;
    },
    quiet = false,
  ): boolean => {
    const incoming = m.source === "contact";
    const id = chats.insertMessage({
      chatId: chat.id,
      providerId: m.providerId,
      direction: incoming ? "in" : "out",
      source: m.source,
      sentBy: m.sentBy,
      asUser: m.asUser,
      body: m.body,
      ts: m.ts,
    });
    if (id === null) return false; // daha önce kaydedilmiş
    const updated = chats.touch(chat.id, m.body, m.ts, incoming && !quiet);
    if (!quiet) announce(number, updated, chats.message(id)!);
    return true;
  };

  const chatFor = (number: NumberRow, m: Pick<InboundMessage, "remoteId" | "source" | "contactName">) =>
    chats.findOrCreate(
      number.id,
      m.remoteId,
      m.source === "contact" ? m.contactName : null,
      displayFromRemote(m.remoteId),
    );

  // Geçmiş: sohbet başına en yeni HISTORY_PER_CHAT mesaj, sessizce. Liste değiştiyse tek bir olay yayılır.
  const importHistory = (number: NumberRow, list: InboundMessage[]) => {
    const byChat = new Map<string, InboundMessage[]>();
    for (const m of list) byChat.set(m.remoteId, [...(byChat.get(m.remoteId) ?? []), m]);
    let saved = 0;
    for (const group of byChat.values()) {
      const latest = group.sort((a, b) => a.ts - b.ts).slice(-HISTORY_PER_CHAT);
      // Ad için en yeni müşteri mesajındaki profil adı kullanılır.
      const named = [...latest].reverse().find((m) => m.source === "contact" && cleanName(m.contactName));
      const chat = chatFor(number, named ?? latest[0]!);
      // Geçmiş birkaç parça halinde gelir: sınır sohbetin toplamına uygulanır. Yeniden eskiye gidilir;
      // sohbette bundan yeni HISTORY_PER_CHAT mesaj zaten varsa daha eskisi alınmaz.
      for (const m of [...latest].reverse()) {
        if (chats.countNewer(chat.id, m.ts) >= HISTORY_PER_CHAT) break;
        if (save(number, chat, { providerId: m.providerId, source: m.source, sentBy: null, asUser: null, body: m.body, ts: m.ts }, true)) {
          saved++;
        }
      }
    }
    if (saved > 0) {
      logger.info({ number: number.id, saved }, "geçmiş mesajlar içe aktarıldı");
      hub.publish(number.id, { type: "chats_synced", numberId: number.id });
    }
  };

  return {
    async handleInbound(event: InboundEvent) {
      const number = numbers.bySession(event.session);
      if (!number) return; // silinmiş numaradan geç gelen olay

      if (event.kind === "status") {
        numbers.setStatus(number.id, event.status, event.meId);
        hub.publish(number.id, { type: "number_status", numberId: number.id, status: event.status });
        return;
      }

      if (event.kind === "contacts") {
        const list = event.contacts
          .map((c) => ({ remoteId: c.remoteId, name: cleanName(c.name) }))
          .filter((c): c is { remoteId: string; name: string } => c.name !== null);
        if (list.length === 0) return;
        if (chats.saveContacts(number.id, list) > 0) hub.publish(number.id, { type: "chats_synced", numberId: number.id });
        return;
      }

      if (event.kind === "history") {
        importHistory(number, event.messages);
        return;
      }

      save(number, chatFor(number, event), {
        providerId: event.providerId,
        source: event.source,
        sentBy: null,
        asUser: null,
        body: event.body,
        ts: event.ts,
      });
    },

    async recordPanelSend({ chatId, userId, asUserId, body, providerId }) {
      const chat = chats.get(chatId);
      const number = chat ? numbers.get(chat.number_id) : null;
      if (!chat || !number) return;
      save(number, chat, { providerId, source: "panel", sentBy: userId, asUser: asUserId, body, ts: Date.now() });
    },
  };
};
