// Oturum: imzalı JWT httpOnly çerezde. Her istekte kullanıcı (ve rolü) veritabanından okunur:
// silinen/devre dışı bırakılan kullanıcı ya da değişen izin anında etkili olur.
// Ekranına geçme: çerezde `as` = hedef kullanıcı. Kurallar her istekte yeniden denetlenir.
import { createJwt } from "@mustafakurtt/hono-core/auth";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Database } from "../../db/client";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { HttpFailure } from "../../shared/http";
import { limitToActor } from "../../shared/access";
import { impersonatedPermissions, isSubset, parsePermissions } from "../../shared/permissions";
import type { SessionUser } from "../../shared/types";

const COOKIE = "session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// uid: gerçek kişi. as: ekranına geçilen kullanıcı. tv: token sürümü (şifre değişince artar, eski oturumlar düşer).
// jti: oturum kimliği; çıkışta revoked_sessions tablosuna yazılır ve o çerez bir daha kabul edilmez.
type Claims = { uid: number; as?: number; tv?: number; jti?: string };

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

export const asImpersonated = (target: SessionUser, actor: SessionUser): SessionUser =>
  limitToActor({ ...target, permissions: impersonatedPermissions(target.permissions, actor.permissions) }, actor);

const tokenVersion = (db: Database, userId: number): number =>
  db.query<{ v: number }, [number]>("SELECT token_version AS v FROM users WHERE id = ?").get(userId)?.v ?? -1;

const isRevoked = (db: Database, jti: string): boolean =>
  db.query("SELECT 1 FROM revoked_sessions WHERE jti = ?").get(jti) !== null;

// Çıkış: bu oturumun çerezi süresi dolana kadar reddedilir. Süresi dolmuş kayıtlar temizlenir.
export const revokeSession = (db: Database, claims: Claims & { exp?: number }) => {
  if (!claims.jti) return;
  const now = Math.floor(Date.now() / 1000);
  db.query("DELETE FROM revoked_sessions WHERE exp < ?").run(now);
  db.query("INSERT OR IGNORE INTO revoked_sessions (jti, exp) VALUES (?, ?)").run(claims.jti, claims.exp ?? now + MAX_AGE_SECONDS);
};

export type ResolvedSession = { user: SessionUser; actor: SessionUser | null };

// Çerezdeki bilgiyi veritabanına göre çözümler; geçersizse null. Canlı akış bunu her olayda yeniden çağırır.
export const resolveSession = (db: Database, claims: Claims): ResolvedSession | null => {
  if (claims.jti && isRevoked(db, claims.jti)) return null;
  const real = findSessionUser(db, claims.uid);
  if (!real || tokenVersion(db, real.id) !== (claims.tv ?? 0)) return null;
  const target = claims.as ? findSessionUser(db, claims.as) : null;
  // Geçiş artık geçerli değilse (hedef silindi, izin kalktı) kendi hesabına düşer.
  if (target && canImpersonate(real, target)) return { user: asImpersonated(target, real), actor: real };
  return { user: real, actor: null };
};

export const startSession = async (deps: AppDeps, c: Context, userId: number, asUserId?: number) => {
  const tv = tokenVersion(deps.db, userId);
  const jti = crypto.randomUUID();
  const token = await jwtFor(deps).sign(asUserId ? { uid: userId, as: asUserId, tv, jti } : { uid: userId, tv, jti });
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
    const session = claims ? resolveSession(deps.db, claims) : null;
    if (!claims || !session) throw new HttpFailure(401, "Oturum açmanız gerekiyor");
    c.set("user", session.user);
    c.set("actor", session.actor);
    c.set("resolve", () => resolveSession(deps.db, claims));
    c.set("claims", claims);
    await next();
  };

// İzin kontrolü olan alt uygulamalar için.
export const requirePermission =
  (permission: SessionUser["permissions"][number]): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    if (!c.get("user").permissions.includes(permission)) throw new HttpFailure(403, "Bu işlem için yetkiniz yok");
    await next();
  };
