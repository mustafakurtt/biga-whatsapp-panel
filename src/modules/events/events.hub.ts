// Canlı akış merkezi: açık SSE bağlantılarına olay dağıtır. Olayı sadece o numarayı görebilenler alır.
import type { Database } from "../../db/client";
import { viewersOfNumber } from "../../shared/access";
import type { LiveHub } from "../../shared/contracts";
import type { LiveEvent } from "../../shared/types";

type Send = (event: LiveEvent) => void;
type Listener = { send: Send; allow?: (numberId: number | null) => boolean };

export const createLiveHub = (db: Database): LiveHub => {
  const listeners = new Map<number, Set<Listener>>();

  const deliver = (listener: Listener, numberId: number | null, event: LiveEvent) => {
    try {
      if (listener.allow && !listener.allow(numberId)) return;
      listener.send(event);
    } catch {
      // kopmuş bağlantı; kendi aboneliğini kapatır
    }
  };

  return {
    subscribe(userId, send, allow) {
      const set = listeners.get(userId) ?? new Set<Listener>();
      const listener: Listener = { send, allow };
      set.add(listener);
      listeners.set(userId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(userId);
      };
    },
    publish(numberId, event) {
      if (listeners.size === 0) return;
      // Yetki her olayda veritabanından okunur: rol ya da atama değişirse hemen etkili olur.
      for (const userId of viewersOfNumber(db, numberId)) {
        for (const listener of listeners.get(userId) ?? []) deliver(listener, numberId, event);
      }
    },
    broadcast(event) {
      for (const set of listeners.values()) for (const listener of set) deliver(listener, null, event);
    },
  };
};
