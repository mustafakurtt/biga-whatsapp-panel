// Canlı akış: EventSource('/api/events'), adsız `data:` mesajları. Olaylar sorgu önbelleğine yazılır.
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { get } from "../../api/client";
import { appendMessage, applyChatUpdate, removeNote, upsertNote } from "../../api/cache";
import { qk } from "../../api/queries";
import type { LiveEvent, NumberView, Viewer } from "../../api/types";

// ---------- bağlantı durumu ----------
let connected = false;
const ls = new Set<() => void>();
const setConnected = (v: boolean) => {
  if (connected === v) return;
  connected = v;
  ls.forEach((l) => l());
};
export const useLiveConnected = () =>
  useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => connected,
  );

/** Açık sohbet (okunmamış farkı hesaplanırken listeden düşmesin diye) */
let openChatId: number | null = null;
export const setOpenChatId = (id: number | null) => {
  openChatId = id;
};

export function handleLiveEvent(qc: QueryClient, ev: LiveEvent, meId: number): void {
  switch (ev.type) {
    case "message":
      applyChatUpdate(qc, ev.chat, meId, { moveTop: true, incoming: ev.message.direction === "in", keepId: openChatId });
      appendMessage(qc, ev.message);
      break;
    case "chat_updated":
      applyChatUpdate(qc, ev.chat, meId, { keepId: openChatId });
      break;
    case "note":
      upsertNote(qc, ev.chatId, ev.note);
      break;
    case "note_deleted":
      removeNote(qc, ev.chatId, ev.noteId);
      break;
    case "viewers":
      qc.setQueryData<Viewer[]>(qk.viewers(ev.chatId), ev.viewers ?? []);
      break;
    case "tags_changed":
      void qc.invalidateQueries({ queryKey: qk.tags });
      break;
    case "chats_synced":
      // Geçmiş eşitlemesi ya da rehber adları: numaranın sohbet listesi ve açık sohbetler yeniden okunur.
      void qc.invalidateQueries({ queryKey: qk.chatsOf(ev.numberId) });
      void qc.invalidateQueries({ queryKey: ["chat"] });
      void qc.invalidateQueries({ queryKey: ["messages"], type: "active" });
      break;
    case "number_status":
      qc.setQueryData<NumberView[]>(qk.numbers, (list) => list?.map((n) => (n.id === ev.numberId ? { ...n, status: ev.status } : n)));
      break;
  }
}

/** Oturum boyunca açık kalır; kullanıcı (ya da ekranına geçilen kişi) değişince yeniden bağlanır. */
export function useLiveEvents(sessionKey: string, meId: number): void {
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let everConnected = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      const source = new EventSource("/api/events");
      es = source;
      source.onopen = () => {
        setConnected(true);
        if (everConnected) {
          // Kopukken kaçırılanlar: listeleri ve açık sohbetleri tazele
          void qc.invalidateQueries({ queryKey: qk.numbers });
          void qc.invalidateQueries({ queryKey: qk.chatsAll });
          void qc.invalidateQueries({ queryKey: qk.tags });
          void qc.invalidateQueries({ queryKey: ["messages"], type: "active" });
          void qc.invalidateQueries({ queryKey: ["notes"], type: "active" });
        }
        everConnected = true;
      };
      source.onerror = () => {
        setConnected(false);
        // Sunucu oturumu reddederse (401) EventSource kapanır: oturumu kontrol edip yeniden bağlan.
        if (source.readyState === EventSource.CLOSED) {
          clearTimeout(retry);
          retry = setTimeout(async () => {
            if (disposed || es !== source) return;
            try {
              await get("/api/auth/me");
              if (!disposed && es === source) connect();
            } catch {
              // 401 ise api() girişe yönlendirdi; ağ hatasıysa biraz sonra tekrar
              if (!disposed && es === source) retry = setTimeout(() => !disposed && es === source && connect(), 5000);
            }
          }, 3000);
        }
      };
      source.onmessage = (e) => {
        let ev: LiveEvent;
        try {
          ev = JSON.parse(e.data as string) as LiveEvent;
        } catch {
          return;
        }
        if (ev && typeof ev === "object" && "type" in ev) handleLiveEvent(qc, ev, meId);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      es?.close();
      setConnected(false);
    };
  }, [qc, sessionKey, meId]);
}
