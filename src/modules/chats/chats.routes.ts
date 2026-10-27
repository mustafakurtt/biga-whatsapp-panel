// Sohbet ayrıntısı, mesaj geçmişi, panelden gönderim, okundu işareti, atama, durum, etiket, notlar,
// "şu an bakıyor", dışa aktarma ve mesaj araması.
import { Hono } from "hono";
import { z } from "zod";
import { accessTo, canSeeNumber, has, numberAccessMap } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, idParam, notFound, readJson } from "../../shared/http";
import { csvResponse, formatTs, toCsv } from "../../shared/csv";
import type { ChatRow, NumberAccess, SessionUser } from "../../shared/types";
import { audit, whoFrom } from "../audit/audit.log";
import { findSessionUser } from "../auth/auth.middleware";
import { createNumbersRepository } from "../numbers/numbers.repository";
import { createChatsRepository } from "./chats.repository";
import { createViewerTracker } from "./viewers";

const sendSchema = z.object({ text: z.string().trim().min(1).max(4096) });
const assignSchema = z.object({ userId: z.number().int().positive().nullable() });
const statusSchema = z.object({ status: z.enum(["open", "closed"]) });
const tagsSchema = z.object({ tagIds: z.array(z.number().int().positive()).max(50) });
const noteSchema = z.object({ text: z.string().trim().min(1).max(2000) });

const SOURCE_LABEL = { contact: "Müşteri", phone: "Telefondan", panel: "Panel" } as const;

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
  const viewers = createViewerTracker(deps.hub);
  const requireWrite = (access: NumberAccess) => {
    if (access !== "write") throw forbidden("Bu sohbette değişiklik yapma yetkiniz yok");
  };
  // İzleme modunda (ekranına geçilmiş, gönderme izni yok) hiçbir şey yazılmaz.
  const watchOnly = (c: { get: (k: "actor") => SessionUser | null }) => {
    const actor = c.get("actor");
    return actor !== null && !actor.permissions.includes("impersonate.send");
  };
  const tagNames = () =>
    new Map(deps.db.query<{ id: number; name: string }, []>("SELECT id, name FROM tags").all().map((t) => [t.id, t.name]));

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
      audit(c, deps, "message.send", `${number.label} → ${chat.name}`, null, chat.number_id);
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
    .put("/:id/status", async (c) => {
      const { chat, access } = visibleChat(c.get("user"), idParam(c));
      requireWrite(access);
      const parsed = statusSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Durum 'open' ya da 'closed' olmalı");
      chats.setStatus(chat.id, parsed.data.status);
      const updated = chats.get(chat.id)!;
      publishChat(updated);
      audit(c, deps, "chat.status", chat.name, parsed.data.status === "closed" ? "kapatıldı" : "açıldı", chat.number_id);
      return c.json({ chat: updated });
    })
    .put("/:id/tags", async (c) => {
      const { chat, access } = visibleChat(c.get("user"), idParam(c));
      requireWrite(access);
      const parsed = tagsSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Etiket listesi hatalı");
      chats.setTags(chat.id, parsed.data.tagIds);
      const updated = chats.get(chat.id)!;
      publishChat(updated);
      const names = tagNames();
      audit(c, deps, "chat.tags", chat.name, updated.tags.map((id) => names.get(id)).join(", ") || "etiketsiz", chat.number_id);
      return c.json({ chat: updated });
    })
    .get("/:id/notes", (c) => {
      const { chat } = visibleChat(c.get("user"), idParam(c));
      return c.json({ notes: chats.notes(chat.id) });
    })
    .post("/:id/notes", async (c) => {
      const { chat } = visibleChat(c.get("user"), idParam(c));
      if (watchOnly(c)) throw forbidden("İzleme modundasınız, not ekleyemezsiniz");
      const parsed = noteSchema.safeParse(await readJson(c));
      if (!parsed.success) throw badRequest("Not boş olamaz");
      const { actor, asUser } = whoFrom(c);
      const note = chats.addNote({
        chatId: chat.id,
        userId: actor.id,
        userName: actor.name,
        asUserName: asUser?.name ?? null,
        body: parsed.data.text,
      });
      deps.hub.publish(chat.number_id, { type: "note", numberId: chat.number_id, chatId: chat.id, note });
      audit(c, deps, "note.create", chat.name, null, chat.number_id);
      return c.json({ note });
    })
    .delete("/:id/notes/:noteId", (c) => {
      const { chat } = visibleChat(c.get("user"), idParam(c));
      const note = chats.note(idParam(c, "noteId"));
      if (!note || note.chat_id !== chat.id) throw notFound("Not bulunamadı");
      const { actor } = whoFrom(c);
      if (watchOnly(c) || (note.user_id !== actor.id && !has(c.get("user"), "users.manage"))) {
        throw forbidden("Sadece kendi notunuzu silebilirsiniz");
      }
      chats.deleteNote(note.id);
      deps.hub.publish(chat.number_id, { type: "note_deleted", numberId: chat.number_id, chatId: chat.id, noteId: note.id });
      audit(c, deps, "note.delete", chat.name, null, chat.number_id);
      return c.json({ ok: true });
    })
    .post("/:id/viewing", (c) => {
      const user = c.get("user");
      const { chat } = visibleChat(user, idParam(c));
      // Ekranına geçen kişi başkasının adına "bakıyor" görünmesin.
      if (c.get("actor")) return c.json({ viewers: viewers.list(chat.id) });
      return c.json({ viewers: viewers.heartbeat(chat, { id: user.id, name: user.name }) });
    })
    .get("/:id/export", (c) => {
      const user = c.get("user");
      if (!has(user, "data.export")) throw forbidden();
      const { chat } = visibleChat(user, idParam(c));
      const number = numbers.get(chat.number_id)!;
      const rows = chats.allMessages(chat.id).map((m) => [
        formatTs(m.ts),
        m.direction === "in" ? "Gelen" : "Giden",
        SOURCE_LABEL[m.source],
        m.source === "contact" ? chat.name : m.as_user_name ? `${m.sent_by_name} (${m.as_user_name} olarak)` : (m.sent_by_name ?? ""),
        m.body,
      ]);
      audit(c, deps, "chat.export", `${number.label} → ${chat.name}`, null, chat.number_id);
      const csv = toCsv(["Zaman", "Yön", "Kaynak", "Yazan", "Mesaj"], rows);
      return csvResponse(c, `sohbet-${number.label}-${chat.name}.csv`, csv);
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
      audit(c, deps, "chat.assign", chat.name, targetName, chat.number_id);
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
