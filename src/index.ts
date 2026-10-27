// Bağımlılıkları kurar, sunucuyu başlatır ve düzgün kapatır.
import { createShutdownManager } from "@mustafakurtt/hono-core/http";
import { createLogger } from "@mustafakurtt/hono-core/logger";
import { createApp } from "./app";
import { readEnv } from "./config/env";
import { openDatabase } from "./db/client";
import { createLiveHub } from "./modules/events/events.hub";
import { createMessageService } from "./modules/messages/messages.service";
import { createNotifier } from "./modules/push/push.notifier";
import { createMockProvider } from "./providers/mock.provider";
import { createWahaProvider } from "./providers/waha.provider";

const env = readEnv();
const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV !== "production" });
const db = openDatabase(env.DATABASE_PATH);
const hub = createLiveHub();
const notifier = createNotifier({ env, db, logger });
const messages = createMessageService({ db, hub, notifier, logger });
const provider = env.PROVIDER === "mock" ? createMockProvider() : createWahaProvider({ env, logger });

const app = createApp({ env, db, logger, provider, hub, notifier, messages });
// SSE bağlantıları uzun ömürlü; Bun'ın boşta zaman aşımı kapatılır (canlı akış kendi ping'ini gönderir).
const server = Bun.serve({ hostname: env.HOST, port: env.PORT, fetch: app.fetch, idleTimeout: 0 });

const shutdown = createShutdownManager({ logger });
shutdown.register("http", async () => {
  await server.stop();
});
shutdown.register("database", async () => db.close());
shutdown.install();

logger.info({ port: server.port, provider: env.PROVIDER }, "Panel başladı");
