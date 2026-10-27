// Numaralar: listeleme (herkes kendi gördüklerini), yönetim ve bağlama (`numbers.manage`), sohbet listesi ve yeni sohbet.
import { Hono } from "hono";
import { z } from "zod";
import { accessTo, has, numberAccessMap } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, idParam, notFound, readJson } from "../../shared/http";
import { displayFromRemote, isValidPhone, normalizePhone, toChatId } from "../../shared/phone";
import type { NumberAccess, NumberRow, SessionUser } from "../../shared/types";
import { audit, whoFrom } from "../audit/audit.log";
import { type ChatFilter, createChatsRepository } from "../chats/chats.repository";
import { createNumbersRepository } from "./numbers.repository";

const createSchema = z.object({ label: z.string().trim().min(1).max(60), phone: z.string().min(1) });
const newChatSchema = z.object({ phone: z.string().min(1), text: z.string().trim().min(1).max(4096) });
const FILTERS = new Set<ChatFilter>(["all", "unread", "mine", "unassigned"]);

const phoneOrFail = (input: string): string => {
  const digits = normalizePhone(input);
  if (!isValidPhone(digits)) throw badRequest("Telefon numarası geçersiz (ör. 905551112233)");
  return digits;
};

export const createNumbersRoutes = (deps: AppDeps) => {
  const numbers = createNumbersRepository(deps.db);
  const chats = createChatsRepository(deps.db);

  const view = (n: NumberRow, access: NumberAccess, unread = 0) => ({
    id: n.id,
    label: n.label,
    phone: n.phone,
    status: n.status,
    me_id: n.me_id,
    access,
    unread,
  });
  const requireManager = (user: SessionUser) => {
    if (!has(user, "numbers.manage")) throw forbidden();
  };
  const numberOrFail = (id: number): NumberRow => {
    const number = numbers.get(id);
    if (!number) throw notFound("Numara bulunamadı");
    return number;
  };
  // Görülemeyen numara için de 404: var olduğu bilgisi sızmasın.
  const visibleNumber = (user: SessionUser, id: number): { number: NumberRow; access: NumberAccess } => {
    const number = numberOrFail(id);
    const access = accessTo(deps.db, user, id);
    if (!access) throw notFound("Numara bulunamadı");
    return { number, access };
  };
  const managedView = (user: SessionUser, id: number) =>
    view(numbers.get(id)!, accessTo(deps.db, user, id) ?? "read", chats.unreadByNumber().get(id) ?? 0);

  return new Hono<AppEnv>()
    .get("/", (c) => {
      const access = numberAccessMap(deps.db, c.get("user"));
      const unread = chats.unreadByNumber();
      const list = numbers.listByIds([...access.keys()]).map((n) => view(n, access.get(n.id)!, unread.get(n.id) ?? 0));
      return c.json({ numbers: list });
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
      audit(c, deps, "number.create", `${number.label} (+${phone})`);
      return c.json({ number: managedView(c.get("user"), number.id) });
    })
    .post("/:id/pair", async (c) => {
      requireManager(c.get("user"));
      const number = numberOrFail(idParam(c));
      if (number.status === "WORKING" || number.status === "RESTRICTED") throw badRequest("Bu numara zaten bağlı");
      const code = await deps.provider.requestPairingCode(number.session, number.phone);
      audit(c, deps, "number.pair", number.label);
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
      return c.json({ number: managedView(c.get("user"), number.id) });
    })
    .delete("/:id", async (c) => {
      requireManager(c.get("user"));
      const number = numberOrFail(idParam(c));
      await deps.provider.deleteSession(number.session).catch((err) => deps.logger.warn({ err }, "oturum silinemedi"));
      numbers.remove(number.id);
      audit(c, deps, "number.delete", number.label);
      return c.json({ ok: true });
    })
    .get("/:id/chats", (c) => {
      const user = c.get("user");
      const { number } = visibleNumber(user, idParam(c));
      const filter = (c.req.query("filter") ?? "all") as ChatFilter;
      if (!FILTERS.has(filter)) throw badRequest("Geçersiz filtre");
      const q = c.req.query("q")?.trim().slice(0, 100) || undefined;
      return c.json({ chats: chats.listByNumber(number.id, { filter, q, userId: user.id }) });
    })
    .post("/:id/chats", async (c) => {
      const user = c.get("user");
      const { number, access } = visibleNumber(user, idParam(c));
      if (!has(user, "chats.start") || access !== "write") throw forbidden("Bu numaradan yeni sohbet başlatma yetkiniz yok");
      const parsed = newChatSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Telefon numarası ve mesaj gerekli");
      const remoteId = toChatId(phoneOrFail(parsed.data.phone));
      if (!chats.findByRemote(number.id, remoteId) && !(await deps.provider.exists(number.session, remoteId))) {
        throw badRequest("Bu numara WhatsApp kullanmıyor");
      }
      const { providerId } = await deps.provider.sendText(number.session, remoteId, parsed.data.text);
      const chat = chats.findOrCreate(number.id, remoteId, null, displayFromRemote(remoteId));
      const { actor, asUser } = whoFrom(c);
      await deps.messages.recordPanelSend({
        chatId: chat.id,
        userId: actor.id,
        asUserId: asUser?.id ?? null,
        body: parsed.data.text,
        providerId,
      });
      audit(c, deps, "chat.start", `${number.label} → ${chat.name}`);
      return c.json({ chat: chats.get(chat.id) });
    });
};
