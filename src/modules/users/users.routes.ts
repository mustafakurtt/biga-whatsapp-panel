// Kullanıcı ve rol yönetimi (`users.manage`). Kural: kimse kendinden yetkili bir kullanıcı/rol oluşturamaz,
// düzenleyemez; kendi rolünü ve hesap durumunu değiştiremez; son aktif Patron korunur.
import { hashPassword } from "@mustafakurtt/hono-core/auth";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, idParam, notFound, readJson } from "../../shared/http";
import { PERMISSIONS, type Permission, isPermission, isSubset } from "../../shared/permissions";
import { accessTo, has } from "../../shared/access";
import type { SessionUser } from "../../shared/types";
import { audit } from "../audit/audit.log";
import { requirePermission, startSession } from "../auth/auth.middleware";
import { type NumberGrant, type RoleView, createUsersRepository } from "./users.repository";

const PATRON_ROLE_ID = 1;

const grants = z
  .array(z.object({ numberId: z.number().int().positive(), access: z.enum(["read", "write"]) }))
  .max(500);
const createSchema = z.object({
  username: z.string().trim().min(3).max(40).regex(/^[\w.-]+$/, "geçersiz karakter"),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(6).max(200),
  roleId: z.number().int().positive(),
  active: z.boolean().default(true),
  numbers: grants.default([]),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(6).max(200).optional(),
  roleId: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  numbers: grants.optional(),
});
const roleSchema = z.object({
  name: z.string().trim().min(2).max(40),
  permissions: z.array(z.string()).max(PERMISSIONS.length * 2),
});

export const createUsersRoutes = (deps: AppDeps) => {
  const repo = createUsersRepository(deps.db);

  const roleOrFail = (id: number): RoleView => {
    const role = repo.role(id);
    if (!role) throw badRequest("Rol bulunamadı");
    return role;
  };
  // Sizden fazla izni olan bir rol verilemez.
  const assignable = (me: SessionUser, role: RoleView) => {
    if (!isSubset(role.permissions, me.permissions)) throw forbidden("Kendinizden yetkili bir rol veremezsiniz");
  };
  // Tüm numaraları görmeyen yönetici, kendisinin erişemediği bir numaraya erişimi olan kullanıcıyı yönetemez
  // (şifresini sıfırlayıp onun hesabıyla o numaraya ulaşmak yetki yükseltmesi olurdu). Etkin seviye karşılaştırılır.
  const coversUser = (me: SessionUser, user: { numbers: NumberGrant[] }, role: RoleView): boolean => {
    if (has(me, "numbers.view_all")) return true;
    const sends = role.permissions.includes("messages.send");
    return user.numbers.every((g) => {
      const mine = accessTo(deps.db, me, g.numberId);
      return mine !== null && (g.access !== "write" || !sends || mine === "write");
    });
  };
  const manageableUser = (me: SessionUser, id: number) => {
    const user = repo.get(id);
    if (!user) throw notFound("Kullanıcı bulunamadı");
    const role = roleOrFail(user.roleId);
    assignable(me, role);
    if (id !== me.id && !coversUser(me, user, role)) {
      throw forbidden("Bu kullanıcının sizin erişmediğiniz numaralara erişimi var; onu yönetemezsiniz");
    }
    return user;
  };
  // Tüm numaraları görmeyen yönetici, kendi erişiminden fazlasını kimseye veremez; kendi erişimini de değiştiremez.
  const checkGrants = (me: SessionUser, grants: NumberGrant[] | undefined, self: boolean) => {
    if (!grants || has(me, "numbers.view_all")) return;
    if (self) throw forbidden("Kendi numara erişiminizi değiştiremezsiniz");
    for (const g of grants) {
      const mine = accessTo(deps.db, me, g.numberId);
      if (!mine || (g.access === "write" && mine !== "write")) {
        throw forbidden("Kendinizde olmayan bir numara erişimini veremezsiniz");
      }
    }
  };
  const cleanPermissions = (me: SessionUser, list: string[]): Permission[] => {
    const permissions = [...new Set(list)].filter(isPermission);
    if (!isSubset(permissions, me.permissions)) throw forbidden("Sahip olmadığınız bir izni veremezsiniz");
    return permissions;
  };

  // Bu alt uygulama /api köküne bağlanır; izin denetimi sadece kendi yollarına uygulanır.
  const guard = requirePermission("users.manage");
  return new Hono<AppEnv>()
    .use("/permissions", guard)
    .use("/users", guard)
    .use("/users/*", guard)
    .use("/roles", guard)
    .use("/roles/*", guard)
    .get("/permissions", (c) => c.json({ permissions: PERMISSIONS }))

    .get("/users", (c) => c.json({ users: repo.list() }))
    .post("/users", async (c) => {
      const me = c.get("user");
      const parsed = createSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Bilgiler eksik ya da hatalı (kullanıcı adı en az 3, şifre en az 6 karakter)");
      if (repo.usernameTaken(parsed.data.username)) throw badRequest("Bu kullanıcı adı zaten var");
      const role = roleOrFail(parsed.data.roleId);
      assignable(me, role);
      checkGrants(me, parsed.data.numbers, false);
      const id = repo.create({ ...parsed.data, passwordHash: await hashPassword(parsed.data.password) });
      audit(c, deps, "user.create", parsed.data.name, role.name);
      return c.json({ user: repo.get(id) });
    })
    .put("/users/:id", async (c) => {
      const me = c.get("user");
      const id = idParam(c);
      const before = manageableUser(me, id);
      const parsed = updateSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Bilgiler hatalı");
      const patch = parsed.data;
      const self = id === me.id;
      if (self && patch.roleId !== undefined && patch.roleId !== before.roleId) throw badRequest("Kendi rolünüzü değiştiremezsiniz");
      if (self && patch.active === false) throw badRequest("Kendi hesabınızı devre dışı bırakamazsınız");
      const nextRole = patch.roleId !== undefined ? roleOrFail(patch.roleId) : null;
      if (nextRole) assignable(me, nextRole);
      checkGrants(me, patch.numbers, self);
      // Değişiklik sonrası hali de kapsamda olmalı: rol değiştirip okuma erişimini yazmaya çevirerek
      // (sonra şifreyi sıfırlayıp o hesaptan) kendi yazamadığı numaraya yazmak mümkün olmasın.
      if (!self && !coversUser(me, { numbers: patch.numbers ?? before.numbers }, nextRole ?? roleOrFail(before.roleId))) {
        throw forbidden("Bu değişiklik kullanıcıya sizin sahip olmadığınız bir numara erişimi verir");
      }
      const losesPatron =
        before.roleId === PATRON_ROLE_ID &&
        ((patch.roleId !== undefined && patch.roleId !== PATRON_ROLE_ID) || patch.active === false);
      if (losesPatron && repo.otherActivePatrons(id) === 0) throw badRequest("En az bir aktif Patron kalmalı");

      const passwordHash = patch.password ? await hashPassword(patch.password) : undefined;
      repo.update(id, { ...patch, passwordHash });
      // Kendi şifresini değiştiren yönetici bu oturumda kalsın (diğer cihazlar düşer).
      if (self && passwordHash) await startSession(deps, c, me.id);
      const changed = Object.keys(patch).map((k) => (k === "password" ? "şifre" : k)).join(", ");
      audit(c, deps, "user.update", before.name, changed || null);
      return c.json({ user: repo.get(id) });
    })
    .delete("/users/:id", (c) => {
      const me = c.get("user");
      const id = idParam(c);
      if (id === me.id) throw badRequest("Kendinizi silemezsiniz");
      const user = manageableUser(me, id);
      if (user.roleId === PATRON_ROLE_ID && repo.otherActivePatrons(id) === 0) throw badRequest("En az bir aktif Patron kalmalı");
      repo.remove(id);
      audit(c, deps, "user.delete", user.name);
      return c.json({ ok: true });
    })

    .get("/roles", (c) => c.json({ roles: repo.roles() }))
    .post("/roles", async (c) => {
      const parsed = roleSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Rol adı en az 2 karakter olmalı");
      if (repo.roleByName(parsed.data.name)) throw badRequest("Bu adda bir rol zaten var");
      const permissions = cleanPermissions(c.get("user"), parsed.data.permissions);
      const id = repo.createRole(parsed.data.name, permissions);
      audit(c, deps, "role.create", parsed.data.name, permissions.join(", ") || null);
      return c.json({ role: repo.role(id) });
    })
    .put("/roles/:id", async (c) => {
      const id = idParam(c);
      const role = repo.role(id);
      if (!role) throw notFound("Rol bulunamadı");
      if (role.system) throw badRequest("Sistem rolü değiştirilemez");
      const parsed = roleSchema.partial().safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Bilgiler hatalı");
      const me = c.get("user");
      assignable(me, role);
      if (parsed.data.name && parsed.data.name.toLowerCase() !== role.name.toLowerCase() && repo.roleByName(parsed.data.name)) {
        throw badRequest("Bu adda bir rol zaten var");
      }
      const permissions = parsed.data.permissions ? cleanPermissions(me, parsed.data.permissions) : undefined;
      // Rolün yeni izinleri, rolü taşıyan kullanıcılara yöneticinin sahip olmadığı numara erişimi vermemeli.
      if (permissions) {
        const next = { ...role, permissions };
        const exceeds = repo.list().some((u) => u.roleId === id && u.id !== me.id && !coversUser(me, u, next));
        if (exceeds) throw forbidden("Bu rolü taşıyan bir kullanıcı, sizin sahip olmadığınız bir numara erişimi kazanırdı");
      }
      repo.updateRole(id, { name: parsed.data.name, permissions });
      audit(c, deps, "role.update", parsed.data.name ?? role.name, permissions?.join(", ") ?? null);
      return c.json({ role: repo.role(id) });
    })
    .delete("/roles/:id", (c) => {
      const id = idParam(c);
      const role = repo.role(id);
      if (!role) throw notFound("Rol bulunamadı");
      if (role.system) throw badRequest("Sistem rolü silinemez");
      if (role.userCount > 0) throw badRequest("Bu rolde kullanıcı var; önce kullanıcıları başka role taşıyın");
      assignable(c.get("user"), role);
      repo.removeRole(id);
      audit(c, deps, "role.delete", role.name);
      return c.json({ ok: true });
    });
};
