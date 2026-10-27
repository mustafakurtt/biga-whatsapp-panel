// "Şu an bakıyor": sohbet açıkken ön yüz 20 sn'de bir haber verir; 45 sn sessiz kalan listeden düşer.
// Bellekte tutulur (sunucu yeniden başlayınca sıfırlanır; zaten anlık bilgi).
import type { LiveHub } from "../../shared/contracts";
import type { ChatRow, Viewer } from "../../shared/types";

const STALE_MS = 45_000;
const SWEEP_MS = 15_000;

export const createViewerTracker = (hub: LiveHub) => {
  // chatId → (userId → { name, seen })
  const chats = new Map<number, { numberId: number; users: Map<number, { name: string; seen: number }> }>();

  const list = (chatId: number): Viewer[] =>
    [...(chats.get(chatId)?.users ?? new Map()).entries()].map(([id, v]) => ({ id, name: v.name }));

  const publish = (chatId: number, numberId: number) =>
    hub.publish(numberId, { type: "viewers", numberId, chatId, viewers: list(chatId) });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [chatId, entry] of chats) {
      let changed = false;
      for (const [userId, v] of entry.users) {
        if (now - v.seen > STALE_MS) {
          entry.users.delete(userId);
          changed = true;
        }
      }
      if (entry.users.size === 0) chats.delete(chatId);
      if (changed) publish(chatId, entry.numberId);
    }
  }, SWEEP_MS);
  (timer as { unref?: () => void }).unref?.();

  return {
    list,
    heartbeat(chat: ChatRow, user: Viewer): Viewer[] {
      const entry = chats.get(chat.id) ?? { numberId: chat.number_id, users: new Map() };
      chats.set(chat.id, entry);
      const isNew = !entry.users.has(user.id);
      entry.users.set(user.id, { name: user.name, seen: Date.now() });
      if (isNew) publish(chat.id, chat.number_id);
      return list(chat.id);
    },
  };
};
