// Push aboneliği: tarayıcının PushSubscription'ı kullanıcıya bağlanır.
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, readJson } from "../../shared/http";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().min(1) });

export const createPushRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>()
    .get("/key", (c) => c.json({ publicKey: deps.notifier.publicKey }))
    .post("/subscribe", async (c) => {
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
      deps.db
        .query("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
        .run(parsed.data.endpoint, c.get("user").id);
      return c.json({ ok: true });
    });
