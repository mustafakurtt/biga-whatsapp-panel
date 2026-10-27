// Oturum: imzalı JWT httpOnly çerezde. Her istekte kullanıcı (ve rolü) veritabanından okunur:
// silinen/devre dışı bırakılan kullanıcı ya da değişen izin anında etkili olur.
// Ekranına geçme: çerezde `as` = hedef kullanıcı. Kurallar her istekte yeniden denetlenir.
import { createJwt } from "@mustafakurtt/hono-core/auth";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Database } from "../../db/client";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { HttpFailure } from "../../shared/http";
import { impersonatedPermissions, isSubset, parsePermissions } from "../../shared/permissions";
import type { SessionUser } from "../../shared/types";

const COOKIE = "session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type Claims = { uid: number; as?: number };

const jwtFor = (deps: AppDeps) => createJwt<Claims>({ secret: deps.env.JWT_SECRET, expiresInSeconds: MAX_AGE_SECONDS });

type UserRow = { id: number; username: string; name: string; roleId: number; roleName: string; permissions: string; active: number };

// Aktif kullanıcıyı rolü ve izinleriyle okur; yoksa ya da devre dışıysa null.
export const findSessionUser = (db: Database, id: number): SessionUser | null => {
  const row = db
    .query<UserRow, [number]>(
      `SELECT u.id, u.username, u.name, u.role_id AS roleId, r.name AS roleName, r.permissions, u.active
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    )
    .get(id);
  if (!row || !row.active) return null;
  const { permissions, active: _active, ...rest } = row;
  return { ...rest, permissions: parsePermissions(permissions) };
};

// actor, target'ın ekranına geçebilir mi? (Kimse geçerek yetki kazanamaz.)
export const canImpersonate = (actor: SessionUser, target: SessionUser): boolean =>
  actor.id !== target.id &&
  actor.permissions.includes("impersonate.view") &&
  isSubset(target.permissions, actor.permissions);

export const asImpersonated = (target: SessionUser, actor: SessionUser): SessionUser => ({
  ...target,
  permissions: impersonatedPermissions(target.permissions, actor.permissions),
});

export const startSession = async (deps: AppDeps, c: Context, userId: number, asUserId?: number) => {
  const token = await jwtFor(deps).sign(asUserId ? { uid: userId, as: asUserId } : { uid: userId });
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: deps.env.COOKIE_SECURE,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
};

export const endSession = (c: Context) => deleteCookie(c, COOKIE, { path: "/" });

export const requireUser =
  (deps: AppDeps): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const token = getCookie(c, COOKIE);
    const claims = token ? await jwtFor(deps).verify(token) : null;
    const real = claims ? findSessionUser(deps.db, claims.uid) : null;
    if (!real) throw new HttpFailure(401, "Oturum açmanız gerekiyor");

    const target = claims?.as ? findSessionUser(deps.db, claims.as) : null;
    if (target && canImpersonate(real, target)) {
      c.set("user", asImpersonated(target, real));
      c.set("actor", real);
    } else {
      // Geçiş artık geçerli değilse (hedef silindi, izin kalktı) kendi hesabına düşer.
      c.set("user", real);
      c.set("actor", null);
    }
    await next();
  };

// İzin kontrolü olan alt uygulamalar için.
export const requirePermission =
  (permission: SessionUser["permissions"][number]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!c.get("user").permissions.includes(permission)) throw new HttpFailure(403, "Bu işlem için yetkiniz yok");
    await next();
  };
