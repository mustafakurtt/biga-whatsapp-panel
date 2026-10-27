// Rotalardan fırlatılan, kullanıcıya gösterilecek hata. app.ts bunu `{error}` JSON'a çevirir.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpFailure extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpFailure(400, message);
export const forbidden = (message = "Bu işlem için yetkiniz yok") => new HttpFailure(403, message);
export const notFound = (message = "Bulunamadı") => new HttpFailure(404, message);
export const providerFailed = (message = "WhatsApp servisine ulaşılamadı") => new HttpFailure(502, message);

// Gövdeyi JSON olarak okur; bozuksa 400.
export const readJson = async <T>(c: Context): Promise<T> => {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw badRequest("Geçersiz istek gövdesi");
  }
};

export const idParam = (c: Context, name = "id"): number => {
  const value = Number(c.req.param(name));
  if (!Number.isInteger(value) || value <= 0) throw badRequest("Geçersiz kimlik");
  return value;
};
