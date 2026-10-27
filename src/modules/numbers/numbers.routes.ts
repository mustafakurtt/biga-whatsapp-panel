// Numaralar: listeleme (herkes kendi gördüklerini), yönetim ve bağlama (patron), sohbet listesi ve yeni sohbet.
import { Hono } from "hono";
import { z } from "zod";
import { canManage, canSeeNumber, canWrite, visibleNumberIds } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, idParam, notFound, readJson } from "../../shared/http";
import { displayFromRemote, isValidPhone, normalizePhone, toChatId } from "../../shared/phone";
import type { NumberRow, SessionUser } from "../../shared/types";
import { createChatsRepository } from "../chats/chats.repository";
import { createNumbersRepository } from "./numbers.repository";

const createSchema = z.object({ label: z.string().trim().min(1).max(60), phone: z.string().min(1) });
const newChatSchema = z.object({ phone: z.string().min(1), text: z.string().trim().min(1).max(4096) });

const publicNumber = (n: NumberRow) => ({ id: n.id, label: n.label, phone: n.phone, status: n.status, me_id: n.me_id });

const phoneOrFail = (input: string): string => {
  const digits = normalizePhone(input);
  if (!isValidPhone(digits)) throw badRequest("Telefon numarası geçersiz (ör. 905551112233)");
  return digits;
};

export const createNumbersRoutes = (deps: AppDeps) => {
  const numbers = createNumbersRepository(deps.db);
  const chats = createChatsRepository(deps.db);

  const requireManager = (user: SessionUser) => {
    if (!canManage(user.role)) throw forbidden();
  };
  const numberOrFail = (id: number): NumberRow => {
    const number = numbers.get(id);
    if (!number) throw notFound("Numara bulunamadı");
    return number;
  };
  // Görülemeyen numara için de 404: var olduğu bilgisi sızmasın.
  const visibleNumber = (user: SessionUser, id: number): NumberRow => {
    const number = numberOrFail(id);
    if (!canSeeNumber(deps.db, user, id)) throw notFound("Numara bulunamadı");
    return number;
  };

  return new Hono<AppEnv>()
    .get("/", (c) => {
      const ids = visibleNumberIds(deps.db, c.get("user"));
      return c.json({ numbers: numbers.listByIds(ids).map(publicNumber) });
    })
    .post("/", async (c) => {
      requireManager(c.get("user"));
      const parsed = createSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Ad ve telefon numarası gerekli");
      const phone = phoneOrFail(parsed.data.phone);
      if (numbers.byPhone(phone)) throw badRequest("Bu numara zaten ekli");
      const number = numbers.create(parsed.data.label, phone);
      // Oturum açılamasa da numara kalır; "Eşleştirme kodu al" tekrar dener.
      await deps.provider.createSession(number.session).catch((err) => deps.logger.warn({ err }, "oturum açılamadı"));
      return c.json({ number: publicNumber(numbers.get(number.id)!) });
    })
    .post("/:id/pair", async (c) => {
      requireManager(c.get("user"));
      const number = numberOrFail(idParam(c));
      if (number.status === "WORKING") throw badRequest("Bu numara zaten bağlı");
      const code = await deps.provider.requestPairingCode(number.session, number.phone);
      return c.json({ code });
    })
    .get("/:id/qr", async (c) => {
      requireManager(c.get("user"));
      const number = numberOrFail(idParam(c));
      if (number.status === "WORKING") throw badRequest("Bu numara zaten bağlı");
      const png = await deps.provider.getQr(number.session);
      if (!png) throw notFound("QR kodu hazır değil, birkaç saniye sonra tekrar deneyin");
      return c.body(png as Uint8Array<ArrayBuffer>, 200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    })
    .post("/:id/refresh", async (c) => {
      requireManager(c.get("user"));
      const number = numberOrFail(idParam(c));
      const { status, meId } = await deps.provider.getStatus(number.session);
      numbers.setStatus(number.id, status, meId);
      if (status !== number.status) deps.hub.publish(number.id, { type: "number_status", numberId: number.id, status });
      return c.json({ number: publicNumber(numbers.get(number.id)!) });
    })
    .delete("/:id", async (c) => {
      requireManager(c.get("user"));
      const number = numberOrFail(idParam(c));
      await deps.provider.deleteSession(number.session).catch((err) => deps.logger.warn({ err }, "oturum silinemedi"));
      numbers.remove(number.id);
      return c.json({ ok: true });
    })
    .get("/:id/chats", (c) => {
      const number = visibleNumber(c.get("user"), idParam(c));
      return c.json({ chats: chats.listByNumber(number.id) });
    })
    .post("/:id/chats", async (c) => {
      const user = c.get("user");
      const number = visibleNumber(user, idParam(c));
      if (!canWrite(user.role)) throw forbidden("Salt okunur yetkiyle mesaj gönderemezsiniz");
      const parsed = newChatSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Telefon numarası ve mesaj gerekli");
      const remoteId = toChatId(phoneOrFail(parsed.data.phone));
      const { providerId } = await deps.provider.sendText(number.session, remoteId, parsed.data.text);
      const chat = chats.findOrCreate(number.id, remoteId, null, displayFromRemote(remoteId));
      await deps.messages.recordPanelSend({ chatId: chat.id, userId: user.id, body: parsed.data.text, providerId });
      return c.json({ chat: chats.get(chat.id) });
    });
};
