// GET /api/events: SSE akışı. Her olay `data: <LiveEvent JSON>`; bağlantı açık kalsın diye 25 sn'de bir ping.
// Oturum her olayda ve her ping'de yeniden denetlenir: hesap kapatılır, şifre değişir ya da ekranına geçme
// izni kalkarsa akış hemen veri göndermeyi bırakır ve kapanır.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { canSeeNumber } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";

const PING_MS = 25_000;

export const createEventsRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>().get("/", (c) =>
    streamSSE(c, async (stream) => {
      const userId = c.get("user").id;
      const resolve = c.get("resolve");
      const current = () => {
        const session = resolve();
        return session && session.user.id === userId ? session.user : null;
      };
      const allow = (numberId: number | null) => {
        const user = current();
        if (!user) {
          void stream.close();
          return false;
        }
        return numberId === null || canSeeNumber(deps.db, user, numberId);
      };
      const unsubscribe = deps.hub.subscribe(
        userId,
        (event) => {
          void stream.writeSSE({ data: JSON.stringify(event) });
        },
        allow,
      );
      stream.onAbort(unsubscribe);
      await stream.write(": bağlandı\n\n");
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(PING_MS);
        if (!current()) break;
        await stream.write(": ping\n\n");
      }
      unsubscribe();
      if (!stream.closed) await stream.close();
    }),
  );
