// Bağımlılıkları kurar, sunucuyu başlatır ve düzgün kapatır.
import { createShutdownManager } from "@mustafakurtt/hono-core/http";
import { createLogger } from "@mustafakurtt/hono-core/logger";
import { createApp } from "./app";
import { readEnv } from "./config/env";
import { openDatabase } from "./db/client";
import { createAuditLog } from "./modules/audit/audit.log";
import { createLiveHub } from "./modules/events/events.hub";
import { createMessageService } from "./modules/messages/messages.service";
import { createNumbersRepository } from "./modules/numbers/numbers.repository";
import { createNotifier } from "./modules/push/push.notifier";
import { createBaileysProvider } from "./providers/baileys.provider";
import { createMockProvider } from "./providers/mock.provider";
import type { InboundHandler } from "./shared/contracts";

const env = readEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV !== "production" });
const db = openDatabase(env.DATABASE_PATH);
const hub = createLiveHub(db);
const notifier = createNotifier({ env, db, logger });
const messages = createMessageService({ db, hub, notifier, logger });

// Sağlayıcıdan gelen her olay (mesaj, durum) mesaj servisine gider.
const onEvent: InboundHandler = (event) => {
  messages.handleInbound(event).catch((err) => logger.error({ err }, "WhatsApp olayı işlenemedi"));
};
const provider = env.PROVIDER === "mock" ? createMockProvider({ onEvent }) : createBaileysProvider({ env, logger, onEvent });

const app = createApp({ env, db, logger, provider, hub, notifier, messages, audit: createAuditLog(db) });
// SSE bağlantıları uzun ömürlü; Bun'ın boşta zaman aşımı kapatılır (canlı akış kendi ping'ini gönderir).
const server = Bun.serve({ hostname: env.HOST, port: env.PORT, fetch: app.fetch, idleTimeout: 0 });

const shutdown = createShutdownManager({ logger });
shutdown.register("http", async () => {
  await server.stop();
});
shutdown.register("whatsapp", () => provider.stop());
shutdown.register("database", async () => db.close());
shutdown.install();

logger.info({ port: server.port, provider: env.PROVIDER }, "Panel başladı");

// Daha önce bağlanmış numaraları yeniden bağla.
const sessions = createNumbersRepository(db)
  .all()
  .map((n) => n.session);
await provider.resume(sessions);
