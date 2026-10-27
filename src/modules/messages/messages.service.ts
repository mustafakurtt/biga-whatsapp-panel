// Mesajların tek giriş noktası: kaydeder, canlı akışa yayar, push bildirimi gönderir.
import type { Logger } from "@mustafakurtt/hono-core/logger";
import type { Database } from "../../db/client";
import type { InboundEvent, LiveHub, MessageService, Notifier } from "../../shared/contracts";
import { displayFromRemote } from "../../shared/phone";
import type { ChatRow, NumberRow } from "../../shared/types";
import { type MessageView, createChatsRepository } from "../chats/chats.repository";
import { createNumbersRepository } from "../numbers/numbers.repository";

const PREVIEW_LENGTH = 140;
const preview = (text: string) => (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text);

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
    const who = message.source === "panel" ? (message.sent_by_name ?? "Panel") : "Telefondan";
    const body = message.source === "contact" ? preview(message.body) : `${who}: ${preview(message.body)}`;
    notifier
      .notifyNumber(number.id, { title, body, url: `/?chat=${chat.id}` }, message.sent_by ?? undefined)
      .catch((err) => logger.warn({ err }, "push gönderilemedi"));
  };

  const save = (
    number: NumberRow,
    chat: ChatRow,
    m: { providerId: string | null; source: MessageView["source"]; sentBy: number | null; body: string; ts: number },
  ) => {
    const incoming = m.source === "contact";
    const id = chats.insertMessage({
      chatId: chat.id,
      providerId: m.providerId,
      direction: incoming ? "in" : "out",
      source: m.source,
      sentBy: m.sentBy,
      body: m.body,
      ts: m.ts,
    });
    if (id === null) return; // daha önce kaydedilmiş
    const updated = chats.touch(chat.id, m.body, m.ts, incoming);
    announce(number, updated, chats.message(id)!);
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

      const chat = chats.findOrCreate(
        number.id,
        event.remoteId,
        event.source === "contact" ? event.contactName : null,
        displayFromRemote(event.remoteId),
      );
      save(number, chat, { providerId: event.providerId, source: event.source, sentBy: null, body: event.body, ts: event.ts });
    },

    async recordPanelSend({ chatId, userId, body, providerId }) {
      const chat = chats.get(chatId);
      const number = chat ? numbers.get(chat.number_id) : null;
      if (!chat || !number) return;
      save(number, chat, { providerId, source: "panel", sentBy: userId, body, ts: Date.now() });
    },
  };
};
