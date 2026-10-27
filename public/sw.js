// Service worker: push bildirimleri ve bildirime tıklayınca paneli açma. Önbellek yok (/api asla önbelleğe alınmaz).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// PWA kurulabilirliği için boş fetch dinleyicisi; istekler doğrudan ağa gider.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Yeni mesaj";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.url || undefined, // aynı sohbetin bildirimleri üst üste yığılmasın
      renotify: Boolean(data.url),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        // Açık uygulama sohbeti sayfayı yenilemeden açar (app.js "open-url" mesajını dinler).
        client.postMessage({ type: "open-url", url });
        return;
      }
      return self.clients.openWindow(url);
    })(),
  );
});
