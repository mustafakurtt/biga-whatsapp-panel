// Push aboneliği: tarayıcının PushSubscription'ı kullanıcıya bağlanır.
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, readJson } from "../../shared/http";

// Tarayıcıların push servisleri (başka adrese istek atılmasın).
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
  "notify.windows.com",
];
const isPushHost = (endpoint: string) => {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine(isPushHost, "bilinmeyen push servisi"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(1000) });

export const createPushRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/key", (c) => c.json({ publicKey: deps.notifier.publicKey }))
    .post("/subscribe", async (c) => {
      // Başkasının ekranındayken açılan abonelik o kişinin bildirimlerini bu tarayıcıya taşırdı.
      if (c.get("actor")) throw forbidden("Başkasının ekranındayken bildirim açılamaz; önce kendi hesabınıza dönün");
      const parsed = subscriptionSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Geçersiz bildirim aboneliği");
      const { endpoint, keys } = parsed.data;
      deps.db
        .query(
          `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
           ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
        )
        .run(endpoint, c.get("user").id, keys.p256dh, keys.auth);
      return c.json({ ok: true });
    })
    .post("/unsubscribe", async (c) => {
      const parsed = unsubscribeSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Geçersiz istek");
      // Endpoint'i bilen tarayıcının kendisidir; kimin adına kayıtlı olursa olsun silinir.
      deps.db.query("DELETE FROM push_subscriptions WHERE endpoint = ?").run(parsed.data.endpoint);
      return c.json({ ok: true });
    });
