/// <reference lib="webworker" />
// Service worker: uygulama kabuğunu önbelleğe alır (hızlı açılış), push bildirimlerini gösterir,
// bildirime tıklayınca ilgili sohbeti açar. /api asla önbelleğe alınmaz.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

self.addEventListener("install", () => void self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// Sayfa gezinmeleri (ör. /n/1/c/5, /?chat=5) önbellekteki index.html ile açılır; /api hariç.
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }));

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try {
    data = (event.data?.json() as PushPayload) ?? {};
  } catch {
    data = { body: event.data?.text() ?? "" };
  }
  // iOS dahil: her push için bildirim gösterilmeli, yoksa tarayıcı aboneliği kısıtlayabilir.
  event.waitUntil(
    self.registration.showNotification(data.title || "Yeni mesaj", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.url || undefined, // aynı sohbetin bildirimleri üst üste yığılmasın
      data: { url: data.url || "/" },
      // renotify ve timestamp her tarayıcının tiplerinde yok
      ...({ renotify: Boolean(data.url), timestamp: Date.now() } as object),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | null)?.url || "/";
  const url = new URL(raw, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = all.filter((c) => new URL(c.url).origin === self.location.origin);
      // Görünür pencereyi tercih et (kurulu PWA ya da açık sekme)
      const client = same.find((c) => c.visibilityState === "visible") ?? same[0];
      if (client) {
        try {
          await client.focus();
        } catch {
          // bazı tarayıcılar odak izni vermez
        }
        // Açık uygulama sohbeti sayfayı yenilemeden açar (src/features/app/useDeepLinks.ts dinler).
        client.postMessage({ type: "open-url", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// Tarayıcı aboneliği yenilerse sunucuya yeni aboneliği bildir (çerez aynı kökenle gider).
self.addEventListener("pushsubscriptionchange", (event) => {
  const ev = event as ExtendableEvent;
  ev.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/key", { credentials: "same-origin" });
        if (!res.ok) return;
        const { publicKey } = (await res.json()) as { publicKey?: string };
        if (!publicKey) return;
        const padding = "=".repeat((4 - (publicKey.length % 4)) % 4);
        const raw = atob((publicKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
        const key = new Uint8Array(new ArrayBuffer(raw.length));
        for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
        const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // kullanıcı uygulamayı açınca yeniden denenir
      }
    })(),
  );
});
