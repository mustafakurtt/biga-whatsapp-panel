// Web Push (sekme kapalıyken bildirim). VAPID anahtarları yoksa sessizce kapalıdır.
import type { Logger } from "@mustafakurtt/hono-core/logger";
import webpush from "web-push";
import type { Env } from "../../config/env";
import type { Database } from "../../db/client";
import { viewersOfNumber } from "../../shared/access";
import type { Notifier } from "../../shared/contracts";

type SubscriptionRow = { endpoint: string; p256dh: string; auth: string };

export const createNotifier = (deps: { env: Env; db: Database; logger: Logger }): Notifier => {
  const { env, db, logger } = deps;
  const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  if (enabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  else logger.info("VAPID anahtarı yok, push bildirimleri kapalı");

  const remove = db.query("DELETE FROM push_subscriptions WHERE endpoint = ?");

  return {
    publicKey: enabled ? env.VAPID_PUBLIC_KEY : "",
    async notifyNumber(numberId, payload, exceptUserId) {
      if (!enabled) return;
      const userIds = viewersOfNumber(db, numberId).filter((id) => id !== exceptUserId);
      if (userIds.length === 0) return;
      const marks = userIds.map(() => "?").join(",");
      const subs = db
        .query<SubscriptionRow, number[]>(
          `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${marks})`,
        )
        .all(...userIds);
      const json = JSON.stringify(payload);
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json, {
              TTL: 60 * 60,
            });
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            // Tarayıcı aboneliği iptal etmiş: kaydı sil.
            if (status === 404 || status === 410) remove.run(s.endpoint);
            else logger.warn({ err, status }, "push gönderilemedi");
          }
        }),
      );
    },
  };
};
