// Etiketler: herkes okur, `tags.manage` yönetir. Değişince tüm bağlı kullanıcılara `tags_changed` gider.
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, idParam, notFound, readJson } from "../../shared/http";
import { sortTr } from "../../shared/sort";
import { TAG_COLORS, type Tag } from "../../shared/types";
import { audit } from "../audit/audit.log";
import { requirePermission } from "../auth/auth.middleware";

const schema = z.object({ name: z.string().trim().min(1).max(30), color: z.enum(TAG_COLORS) });

export const createTagsRoutes = (deps: AppDeps) => {
  const { db } = deps;
  const get = (id: number) => db.query<Tag, [number]>("SELECT id, name, color FROM tags WHERE id = ?").get(id);
  const nameTaken = (name: string, exceptId = 0) =>
    db.query("SELECT 1 FROM tags WHERE name = ? COLLATE NOCASE AND id != ?").get(name, exceptId) !== null;
  const changed = () => deps.hub.broadcast({ type: "tags_changed" });
  const manage = requirePermission("tags.manage");

  return new Hono<AppEnv>()
    .get("/", (c) => c.json({ tags: sortTr(db.query<Tag, []>("SELECT id, name, color FROM tags").all(), (t) => t.name) }))
    .post("/", manage, async (c) => {
      const parsed = schema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Etiket adı ve geçerli bir renk gerekli");
      if (nameTaken(parsed.data.name)) throw badRequest("Bu adda bir etiket zaten var");
      const { id } = db
        .query<{ id: number }, [string, string]>("INSERT INTO tags (name, color) VALUES (?, ?) RETURNING id")
        .get(parsed.data.name, parsed.data.color)!;
      changed();
      audit(c, deps, "tag.create", parsed.data.name);
      return c.json({ tag: get(id) });
    })
    .put("/:id", manage, async (c) => {
      const id = idParam(c);
      const tag = get(id);
      if (!tag) throw notFound("Etiket bulunamadı");
      const parsed = schema.partial().safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Bilgiler hatalı");
      if (parsed.data.name && nameTaken(parsed.data.name, id)) throw badRequest("Bu adda bir etiket zaten var");
      db.query("UPDATE tags SET name = ?, color = ? WHERE id = ?").run(
        parsed.data.name ?? tag.name,
        parsed.data.color ?? tag.color,
        id,
      );
      changed();
      audit(c, deps, "tag.update", parsed.data.name ?? tag.name);
      return c.json({ tag: get(id) });
    })
    .delete("/:id", manage, (c) => {
      const id = idParam(c);
      const tag = get(id);
      if (!tag) throw notFound("Etiket bulunamadı");
      db.query("DELETE FROM tags WHERE id = ?").run(id);
      changed();
      audit(c, deps, "tag.delete", tag.name);
      return c.json({ ok: true });
    });
};
