// Modüller arası arayüzler. Uygulama (app.ts) bunları birbirine bağlar.
import type { Logger } from "@mustafakurtt/hono-core/logger";
import type { Env } from "../config/env";
import type { Database } from "../db/client";
import type { LiveEvent, MessageSource, SessionUser } from "./types";

// WhatsApp sağlayıcısı (WAHA ya da mock; ileride Coexistence). Oturum adı = numbers.session.
export interface MessagingProvider {
  createSession(session: string): Promise<void>;
  requestPairingCode(session: string, phone: string): Promise<string>;
  getQr(session: string): Promise<Uint8Array | null>;
  getStatus(session: string): Promise<{ status: string; meId: string | null }>;
  sendText(session: string, chatId: string, text: string): Promise<{ providerId: string | null }>;
  deleteSession(session: string): Promise<void>;
}

// Sağlayıcıdan gelen, normalize edilmiş olay (webhook ya da mock).
export type InboundEvent =
  | {
      kind: "message";
      session: string;
      providerId: string;
      remoteId: string; // karşı taraf, ör. 905551112233@c.us
      contactName: string | null;
      source: MessageSource; // contact: karşıdan geldi, phone: telefondan yazıldı, panel: panelden gönderildi
      body: string;
      ts: number; // milisaniye
    }
  | { kind: "status"; session: string; status: string; meId: string | null };

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
