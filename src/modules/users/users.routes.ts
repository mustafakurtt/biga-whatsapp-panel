// Kullanıcı yönetimi (sadece patron): ekle, düzenle, sil, numara ata.
import { hashPassword } from "@mustafakurtt/hono-core/auth";
import { Hono } from "hono";
import { z } from "zod";
import { canManage } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, idParam, notFound, readJson } from "../../shared/http";
import { createUsersRepository } from "./users.repository";

const role = z.enum(["patron", "temsilci", "salt_okunur"]);
const numberIds = z.array(z.number().int().positive()).default([]);
const createSchema = z.object({
  username: z.string().trim().min(3).max(40),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(6).max(200),
  role,
  numberIds,
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(6).max(200).optional(),
  role: role.optional(),
  numberIds: z.array(z.number().int().positive()).optional(),
});

export const createUsersRoutes = (deps: AppDeps) => {
  const repo = createUsersRepository(deps.db);
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      if (!canManage(c.get("user").role)) throw forbidden();
      await next();
    })
    .get("/", (c) => c.json({ users: repo.list() }))
    .post("/", async (c) => {
      const parsed = createSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Bilgiler eksik ya da hatalı (kullanıcı adı en az 3, şifre en az 6 karakter)");
      if (repo.usernameTaken(parsed.data.username)) throw badRequest("Bu kullanıcı adı zaten var");
      const hash = await hashPassword(parsed.data.password);
      const id = repo.create({ ...parsed.data, passwordHash: hash });
      return c.json({ user: repo.get(id) });
    })
    .put("/:id", async (c) => {
      const id = idParam(c);
      if (!repo.get(id)) throw notFound("Kullanıcı bulunamadı");
      const parsed = updateSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Bilgiler hatalı");
      if (id === c.get("user").id && parsed.data.role && parsed.data.role !== "patron") {
        throw badRequest("Kendi patron rolünüzü kaldıramazsınız");
      }
      const hash = parsed.data.password ? await hashPassword(parsed.data.password) : undefined;
      repo.update(id, { ...parsed.data, passwordHash: hash });
      return c.json({ user: repo.get(id) });
    })
    .delete("/:id", (c) => {
      const id = idParam(c);
      if (id === c.get("user").id) throw badRequest("Kendinizi silemezsiniz");
      repo.remove(id);
      return c.json({ ok: true });
    });
};
