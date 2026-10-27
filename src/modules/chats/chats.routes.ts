// Sohbet ayrıntısı, mesaj geçmişi, panelden gönderim, okundu işareti, atama ve mesaj araması.
import { Hono } from "hono";
import { z } from "zod";
import { accessTo, canSeeNumber, has, numberAccessMap } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, idParam, notFound, readJson } from "../../shared/http";
import type { ChatRow, NumberAccess, SessionUser } from "../../shared/types";
import { audit, whoFrom } from "../audit/audit.log";
import { findSessionUser } from "../auth/auth.middleware";
import { createNumbersRepository } from "../numbers/numbers.repository";
import { createChatsRepository } from "./chats.repository";

const sendSchema = z.object({ text: z.string().trim().min(1).max(4096) });
const assignSchema = z.object({ userId: z.number().int().positive().nullable() });

export const createChatsRoutes = (deps: AppDeps) => {
  const chats = createChatsRepository(deps.db);
  const numbers = createNumbersRepository(deps.db);

  // Görülemeyen sohbet için de 404: var olduğu bilgisi sızmasın.
  const visibleChat = (user: SessionUser, id: number): { chat: ChatRow; access: NumberAccess } => {
    const chat = chats.get(id);
    const access = chat ? accessTo(deps.db, user, chat.number_id) : null;
    if (!chat || !access) throw notFound("Sohbet bulunamadı");
    return { chat, access };
  };
  const publishChat = (chat: ChatRow) =>
    deps.hub.publish(chat.number_id, { type: "chat_updated", numberId: chat.number_id, chat });

  const chatRoutes = new Hono<AppEnv>()
    .get("/:id", (c) => c.json({ chat: visibleChat(c.get("user"), idParam(c)).chat }))
    .get("/:id/messages", (c) => {
      const { chat } = visibleChat(c.get("user"), idParam(c));
      const raw = c.req.query("before");
      const before = raw === undefined ? undefined : Number(raw);
      if (before !== undefined && !Number.isFinite(before)) throw badRequest("Geçersiz 'before' değeri");
      return c.json({ messages: chats.messages(chat.id, before) });
    })
    .post("/:id/messages", async (c) => {
      const user = c.get("user");
      const { chat, access } = visibleChat(user, idParam(c));
      if (!has(user, "messages.send") || access !== "write") {
        throw forbidden(c.get("actor") ? "İzleme modundasınız, mesaj gönderemezsiniz" : "Bu numarada mesaj gönderme yetkiniz yok");
      }
      const parsed = sendSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Mesaj boş olamaz");
      const number = numbers.get(chat.number_id)!;
      const { providerId } = await deps.provider.sendText(number.session, chat.remote_id, parsed.data.text);
      const { actor, asUser } = whoFrom(c);
      await deps.messages.recordPanelSend({
        chatId: chat.id,
        userId: actor.id,
        asUserId: asUser?.id ?? null,
        body: parsed.data.text,
        providerId,
      });
      audit(c, deps, "message.send", `${number.label} → ${chat.name}`);
      return c.json({ ok: true });
    })
    .post("/:id/read", (c) => {
      const { chat } = visibleChat(c.get("user"), idParam(c));
      // İzlerken başkasının okunmamış sayısı değişmesin.
      if (!c.get("actor") && chat.unread > 0) {
        chats.markRead(chat.id);
        publishChat(chats.get(chat.id)!);
      }
      return c.json({ ok: true });
    })
    .put("/:id/assign", async (c) => {
      const user = c.get("user");
      const { chat, access } = visibleChat(user, idParam(c));
      const parsed = assignSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Kullanıcı seçin");
      const target = parsed.data.userId;
      const selfOnly = (target === user.id || target === null) && (chat.assigned_to === null || chat.assigned_to === user.id);
      if (access !== "write" || (!selfOnly && !has(user, "chats.assign"))) throw forbidden("Bu sohbeti atama yetkiniz yok");
      let targetName = "atanmamış";
      if (target !== null) {
        const assignee = findSessionUser(deps.db, target);
        if (!assignee || !canSeeNumber(deps.db, assignee, chat.number_id)) {
          throw badRequest("Bu kullanıcı bu numarayı göremiyor");
        }
        targetName = assignee.name;
      }
      chats.assign(chat.id, target);
      const updated = chats.get(chat.id)!;
      publishChat(updated);
      audit(c, deps, "chat.assign", chat.name, targetName);
      return c.json({ chat: updated });
    });

  // GET /api/search?q=
  const searchRoutes = new Hono<AppEnv>().get("/", (c) => {
    const q = (c.req.query("q") ?? "").trim().slice(0, 100);
    if (q.length < 2) throw badRequest("En az 2 karakter yazın");
    const ids = [...numberAccessMap(deps.db, c.get("user")).keys()];
    const labels = new Map(numbers.listByIds(ids).map((n) => [n.id, n.label]));
    const chatCache = new Map<number, ChatRow>();
    const results = chats.search(ids, q).map(({ message, chatId }) => {
      const chat = chatCache.get(chatId) ?? chats.get(chatId)!;
      chatCache.set(chatId, chat);
      return { chat, message, numberLabel: labels.get(chat.number_id) ?? "" };
    });
    return c.json({ results });
  });

  return { chatRoutes, searchRoutes };
};
