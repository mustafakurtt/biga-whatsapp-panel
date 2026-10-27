// Modüller arası arayüzler. Uygulama (app.ts) bunları birbirine bağlar.
import type { Logger } from "@mustafakurtt/hono-core/logger";
import type { Env } from "../config/env";
import type { Database } from "../db/client";
import type { LiveEvent, MessageSource, NumberStatus, SessionUser } from "./types";

// WhatsApp sağlayıcısı (Baileys ya da mock). Oturum adı = numbers.session.
// Sağlayıcı gelen mesajları ve durum değişikliklerini kurulurken verilen `onEvent` ile bildirir.
export interface MessagingProvider {
  // Açılışta: daha önce bağlanmış oturumları yeniden bağlar.
  resume(sessions: string[]): Promise<void>;
  createSession(session: string): Promise<void>;
  requestPairingCode(session: string, phone: string): Promise<string>;
  getQr(session: string): Promise<Uint8Array | null>;
  getStatus(session: string): Promise<{ status: NumberStatus; meId: string | null }>;
  sendText(session: string, chatId: string, text: string): Promise<{ providerId: string | null }>;
  deleteSession(session: string): Promise<void>;
  stop(): Promise<void>;
}

export type InboundHandler = (event: InboundEvent) => void;

// Sağlayıcının kullanıcıya gösterilebilir hatası (Türkçe). app.ts bunu 502'ye çevirir.
export class ProviderError extends Error {}

// Sağlayıcıdan gelen, normalize edilmiş olay.
export type InboundEvent =
  | {
      kind: "message";
      session: string;
      providerId: string;
      remoteId: string; // karşı taraf, ör. 905551112233@s.whatsapp.net
      contactName: string | null;
      source: MessageSource; // contact: karşıdan geldi, phone: telefondan yazıldı, panel: panelden gönderildi
      body: string;
      ts: number; // milisaniye
    }
  | { kind: "status"; session: string; status: NumberStatus; meId: string | null };

// Mesajları kaydeden, canlı akışa yayan ve push gönderen tek yer.
export interface MessageService {
  handleInbound(event: InboundEvent): Promise<void>;
  // Panelden gönderim: sağlayıcıya gönderilmiş mesajı kaydeder (sent_by ile) ve yayar.
  recordPanelSend(input: { chatId: number; userId: number; body: string; providerId: string | null }): Promise<void>;
}

export interface LiveHub {
  subscribe(userId: number, send: (event: LiveEvent) => void): () => void;
  publish(numberId: number, event: LiveEvent): void;
}

export interface Notifier {
  readonly publicKey: string;
  notifyNumber(numberId: number, payload: { title: string; body: string; url?: string }, exceptUserId?: number): Promise<void>;
}

export interface AppDeps {
  env: Env;
  db: Database;
  logger: Logger;
  provider: MessagingProvider;
  hub: LiveHub;
  notifier: Notifier;
  messages: MessageService;
}

// Hono context değişkenleri: requireUser sonrası `c.get("user")`.
export type AppEnv = { Variables: { user: SessionUser } };
