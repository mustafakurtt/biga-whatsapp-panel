// Sadece PROVIDER=mock iken: WhatsApp'sız denemek için sahte gelen mesaj.
import { Hono } from "hono";
import { z } from "zod";
import { has } from "../../shared/access";
import type { AppDeps, AppEnv } from "../../shared/contracts";
import { badRequest, forbidden, notFound, readJson } from "../../shared/http";
import { isValidPhone, normalizePhone, toChatId } from "../../shared/phone";
import { createNumbersRepository } from "../numbers/numbers.repository";

const inboundSchema = z.object({
  numberId: z.number().int().positive(),
  from: z.string().min(1),
  name: z.string().trim().max(80).optional(),
  text: z.string().trim().min(1).max(4096),
});

export const createDevRoutes = (deps: AppDeps) => {
  const numbers = createNumbersRepository(deps.db);
  return new Hono<AppEnv>().post("/inbound", async (c) => {
    if (!has(c.get("user"), "numbers.manage")) throw forbidden();
    const parsed = inboundSchema.safeParse(await readJson(c));
    if (!parsed.success) throw badRequest("numberId, from ve text gerekli");
    const number = numbers.get(parsed.data.numberId);
    if (!number) throw notFound("Numara bulunamadı");
    const digits = normalizePhone(parsed.data.from);
    if (!isValidPhone(digits)) throw badRequest("Telefon numarası geçersiz");
    await deps.messages.handleInbound({
      kind: "message",
      session: number.session,
      providerId: `mock_${crypto.randomUUID()}`,
      remoteId: toChatId(digits),
      contactName: parsed.data.name || null,
      source: "contact",
      body: parsed.data.text,
      ts: Date.now(),
    });
    return c.json({ ok: true });
  });
};
