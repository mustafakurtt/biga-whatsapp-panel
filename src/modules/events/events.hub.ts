// Canlı akış merkezi: açık SSE bağlantılarına olay dağıtır. Olayı sadece o numarayı görebilenler alır.
import type { Database } from "../../db/client";
import { viewersOfNumber } from "../../shared/access";
import type { LiveHub } from "../../shared/contracts";
import type { LiveEvent } from "../../shared/types";

type Send = (event: LiveEvent) => void;

export const createLiveHub = (db: Database): LiveHub => {
  const listeners = new Map<number, Set<Send>>();

  const deliver = (send: Send, event: LiveEvent) => {
    try {
      send(event);
    } catch {
      // kopmuş bağlantı; kendi aboneliğini kapatır
    }
  };

  return {
    subscribe(userId, send) {
      const set = listeners.get(userId) ?? new Set<Send>();
      set.add(send);
      listeners.set(userId, set);
      return () => {
        set.delete(send);
        if (set.size === 0) listeners.delete(userId);
      };
    },
    publish(numberId, event) {
      if (listeners.size === 0) return;
      // Yetki her olayda veritabanından okunur: rol ya da atama değişirse hemen etkili olur.
      for (const userId of viewersOfNumber(db, numberId)) {
        for (const send of listeners.get(userId) ?? []) deliver(send, event);
      }
    },
    broadcast(event) {
      for (const set of listeners.values()) for (const send of set) deliver(send, event);
    },
  };
};
