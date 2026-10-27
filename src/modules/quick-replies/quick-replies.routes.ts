// Hazır yanıtlar: herkes kullanır, `quick_replies.manage` yönetir.
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, idParam, notFound, readJson } from "../../shared/http";
import { sortTr } from "../../shared/sort";
import { audit } from "../audit/audit.log";
import { requirePermission } from "../auth/auth.middleware";

type Item = { id: number; title: string; body: string };

const schema = z.object({ title: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(4096) });

export const createQuickRepliesRoutes = (deps: AppDeps) => {
  const { db } = deps;
  const get = (id: number) => db.query<Item, [number]>("SELECT id, title, body FROM quick_replies WHERE id = ?").get(id);
  const manage = requirePermission("quick_replies.manage");

  return new Hono<AppEnv>()
    .get("/", (c) =>
      c.json({ items: sortTr(db.query<Item, []>("SELECT id, title, body FROM quick_replies").all(), (i) => i.title) }),
    )
    .post("/", manage, async (c) => {
      const parsed = schema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Başlık ve metin gerekli");
      const { id } = db
        .query<{ id: number }, [string, string, number, number]>(
          "INSERT INTO quick_replies (title, body, created_by, created_at) VALUES (?, ?, ?, ?) RETURNING id",
        )
        .get(parsed.data.title, parsed.data.body, c.get("user").id, Date.now())!;
      audit(c, deps, "quick_reply.create", parsed.data.title);
      return c.json({ item: get(id) });
    })
    .put("/:id", manage, async (c) => {
      const id = idParam(c);
      const item = get(id);
      if (!item) throw notFound("Hazır yanıt bulunamadı");
      const parsed = schema.partial().safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Bilgiler hatalı");
      db.query("UPDATE quick_replies SET title = ?, body = ? WHERE id = ?").run(
        parsed.data.title ?? item.title,
        parsed.data.body ?? item.body,
        id,
      );
      audit(c, deps, "quick_reply.update", parsed.data.title ?? item.title);
      return c.json({ item: get(id) });
    })
    .delete("/:id", manage, (c) => {
      const id = idParam(c);
      const item = get(id);
      if (!item) throw notFound("Hazır yanıt bulunamadı");
      db.query("DELETE FROM quick_replies WHERE id = ?").run(id);
      audit(c, deps, "quick_reply.delete", item.title);
      return c.json({ ok: true });
    });
};
