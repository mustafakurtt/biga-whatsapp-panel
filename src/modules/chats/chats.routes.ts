// Sohbet ayrıntısı, mesaj geçmişi, panelden gönderim, okundu işareti.
import { Hono } from "hono";
import { z } from "zod";
import { canSeeNumber, canWrite } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, idParam, notFound, readJson } from "../../shared/http";
import type { ChatRow, SessionUser } from "../../shared/types";
import { createNumbersRepository } from "../numbers/numbers.repository";
import { createChatsRepository } from "./chats.repository";

const sendSchema = z.object({ text: z.string().trim().min(1).max(4096) });

export const createChatsRoutes = (deps: AppDeps) => {
  const chats = createChatsRepository(deps.db);
  const numbers = createNumbersRepository(deps.db);

  // Görülemeyen sohbet için de 404: var olduğu bilgisi sızmasın.
  const visibleChat = (user: SessionUser, id: number): ChatRow => {
    const chat = chats.get(id);
    if (!chat || !canSeeNumber(deps.db, user, chat.number_id)) throw notFound("Sohbet bulunamadı");
    return chat;
  };

  return new Hono<AppEnv>()
    .get("/:id", (c) => c.json({ chat: visibleChat(c.get("user"), idParam(c)) }))
    .get("/:id/messages", (c) => {
      const chat = visibleChat(c.get("user"), idParam(c));
      const raw = c.req.query("before");
      const before = raw === undefined ? undefined : Number(raw);
      if (before !== undefined && !Number.isFinite(before)) throw badRequest("Geçersiz 'before' değeri");
      return c.json({ messages: chats.messages(chat.id, before) });
    })
    .post("/:id/messages", async (c) => {
      const user = c.get("user");
      const chat = visibleChat(user, idParam(c));
      if (!canWrite(user.role)) throw forbidden("Salt okunur yetkiyle mesaj gönderemezsiniz");
      const parsed = sendSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Mesaj boş olamaz");
      const number = numbers.get(chat.number_id)!;
      const { providerId } = await deps.provider.sendText(number.session, chat.remote_id, parsed.data.text);
      await deps.messages.recordPanelSend({ chatId: chat.id, userId: user.id, body: parsed.data.text, providerId });
      return c.json({ ok: true });
    })
    .post("/:id/read", (c) => {
      const chat = visibleChat(c.get("user"), idParam(c));
      chats.markRead(chat.id);
      return c.json({ ok: true });
    });
};
