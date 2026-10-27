// Uygulamanın kurulduğu yer: rotalar + statik PWA. Bağımlılıklar index.ts'te kurulur.
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createAuthRoutes } from "./modules/auth/auth.routes";
import { requireUser } from "./modules/auth/auth.middleware";
import { createChatsRoutes } from "./modules/chats/chats.routes";
import { createDevRoutes } from "./modules/dev/dev.routes";
import { createEventsRoutes } from "./modules/events/events.routes";
import { createNumbersRoutes } from "./modules/numbers/numbers.routes";
import { createPushRoutes } from "./modules/push/push.routes";
import { createUsersRoutes } from "./modules/users/users.routes";
import { type AppDeps, type AppEnv, ProviderError } from "./shared/contracts";
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

  const api = new Hono<AppEnv>();
  api.use(requireUser(deps));
  api.route("/numbers", createNumbersRoutes(deps));
  api.route("/chats", createChatsRoutes(deps));
  api.route("/users", createUsersRoutes(deps));
  api.route("/events", createEventsRoutes(deps));
  api.route("/push", createPushRoutes(deps));
  if (deps.env.PROVIDER === "mock") api.route("/dev", createDevRoutes(deps));
  app.route("/api", api);

  app.notFound((c) => (c.req.path.startsWith("/api") ? c.json({ error: "Bulunamadı" }, 404) : c.text("Bulunamadı", 404)));
  app.use("/*", serveStatic({ root: "./public" }));
  app.get("/*", serveStatic({ path: "./public/index.html" }));
  return app;
};
