// Uygulamanın kurulduğu yer: rotalar + statik PWA. Bağımlılıklar index.ts'te kurulur.
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createAuditRoutes } from "./modules/audit/audit.routes";
import { requireUser } from "./modules/auth/auth.middleware";
import { createAuthRoutes } from "./modules/auth/auth.routes";
import { createChatsRoutes } from "./modules/chats/chats.routes";
import { createDevRoutes } from "./modules/dev/dev.routes";
import { createEventsRoutes } from "./modules/events/events.routes";
import { createNumbersRoutes } from "./modules/numbers/numbers.routes";
import { createPushRoutes } from "./modules/push/push.routes";
import { createQuickRepliesRoutes } from "./modules/quick-replies/quick-replies.routes";
import { createReportsRoutes } from "./modules/reports/reports.routes";
import { createTagsRoutes } from "./modules/tags/tags.routes";
import { createUsersRoutes } from "./modules/users/users.routes";
import { type AppDeps, type AppEnv, ProviderError } from "./shared/contracts";
import { mockAllowed } from "./config/env";
import { HttpFailure } from "./shared/http";

export const createApp = (deps: AppDeps) => {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    if (err instanceof HttpFailure) return c.json({ error: err.message }, err.status);
    if (err instanceof ProviderError) return c.json({ error: err.message }, 502);
    deps.logger.error({ err }, "beklenmeyen hata");
    return c.json({ error: "Sunucu hatası" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", createAuthRoutes(deps));

  const { chatRoutes, searchRoutes } = createChatsRoutes(deps);
  const api = new Hono<AppEnv>();
  api.use(requireUser(deps));
  api.route("/numbers", createNumbersRoutes(deps));
  api.route("/chats", chatRoutes);
  api.route("/search", searchRoutes);
  api.route("/quick-replies", createQuickRepliesRoutes(deps));
  api.route("/tags", createTagsRoutes(deps));
  api.route("/audit", createAuditRoutes(deps));
  api.route("/reports", createReportsRoutes(deps));
  api.route("/events", createEventsRoutes(deps));
  api.route("/push", createPushRoutes(deps));
  if (mockAllowed(deps.env)) api.route("/dev", createDevRoutes(deps));
  // Ön yüzün bilmesi gereken sunucu ayarları.
  api.get("/config", (c) =>
    c.json({ mockAllowed: mockAllowed(deps.env), defaultProvider: deps.env.PROVIDER, pushEnabled: deps.notifier.publicKey !== "" }),
  );
  api.route("/", createUsersRoutes(deps)); // /permissions, /users, /roles
  app.route("/api", api);

  app.notFound((c) => (c.req.path.startsWith("/api") ? c.json({ error: "Bulunamadı" }, 404) : c.text("Bulunamadı", 404)));
  app.use("/*", serveStatic({ root: "./public" }));
  app.get("/*", serveStatic({ path: "./public/index.html" }));
  return app;
};
