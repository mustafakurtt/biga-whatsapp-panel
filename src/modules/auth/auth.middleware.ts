// Oturum: imzalı JWT httpOnly çerezde. Her istekte kullanıcı veritabanından okunur
// (silinen kullanıcı ya da değişen rol anında etkili olur).
import { createJwt } from "@mustafakurtt/hono-core/auth";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { HttpFailure } from "../../shared/http";
import type { SessionUser } from "../../shared/types";

const COOKIE = "session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type Claims = { uid: number };

const jwtFor = (deps: AppDeps) => createJwt<Claims>({ secret: deps.env.JWT_SECRET, expiresInSeconds: MAX_AGE_SECONDS });

export const findSessionUser = (deps: AppDeps, id: number): SessionUser | null =>
  deps.db.query<SessionUser, [number]>("SELECT id, username, name, role FROM users WHERE id = ?").get(id);

export const startSession = async (deps: AppDeps, c: Context, userId: number) => {
  const token = await jwtFor(deps).sign({ uid: userId });
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
    const user = claims ? findSessionUser(deps, claims.uid) : null;
    if (!user) throw new HttpFailure(401, "Oturum açmanız gerekiyor");
    c.set("user", user);
    await next();
  };
