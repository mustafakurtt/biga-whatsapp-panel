// GET /api/events: SSE akışı. Her olay `data: <LiveEvent JSON>`; bağlantı açık kalsın diye 25 sn'de bir ping.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppDeps, AppEnv } from "../../shared/contracts";

const PING_MS = 25_000;

export const createEventsRoutes = (deps: AppDeps) =>
  new Hono<AppEnv>().get("/", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = deps.hub.subscribe(c.get("user").id, (event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      stream.onAbort(unsubscribe);
      await stream.write(": bağlandı\n\n");
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(PING_MS);
        await stream.write(": ping\n\n");
      }
      unsubscribe();
    }),
  );
