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
  // Numara WhatsApp'ta kayıtlı mı? (Yeni sohbet öncesi; olmayan numaraya yazmak kısıtlama sebebi.)
  exists(session: string, chatId: string): Promise<boolean>;
  deleteSession(session: string): Promise<void>;
  stop(): Promise<void>;
}

export type InboundHandler = (event: InboundEvent) => void;

// Sağlayıcının kullanıcıya gösterilebilir hatası (Türkçe). app.ts bunu 502'ye çevirir.
export class ProviderError extends Error {}

// Sağlayıcıdan gelen bir mesaj (canlı ya da geçmiş eşitlemesiyle).
export interface InboundMessage {
  providerId: string;
  remoteId: string; // karşı taraf, ör. 905551112233@s.whatsapp.net
  contactName: string | null; // kişinin WhatsApp profil adı (pushName)
  source: MessageSource; // contact: karşıdan geldi, phone: telefondan yazıldı, panel: panelden gönderildi
  body: string;
  ts: number; // milisaniye
}

// Sağlayıcıdan gelen, normalize edilmiş olay.
export type InboundEvent =
  | ({ kind: "message"; session: string } & InboundMessage)
  // İlk eşleştirmede gelen son sohbetler. Sessizce kaydedilir: okunmamış, bildirim ve mesaj olayı yok.
  | { kind: "history"; session: string; messages: InboundMessage[] }
  // Telefon rehberindeki adlar. Profil adından önceliklidir.
  | { kind: "contacts"; session: string; contacts: { remoteId: string; name: string }[] }
  | { kind: "status"; session: string; status: NumberStatus; meId: string | null };

// Mesajları kaydeden, canlı akışa yayan ve push gönderen tek yer.
export interface MessageService {
  handleInbound(event: InboundEvent): Promise<void>;
  // Panelden gönderim: sağlayıcıya gönderilmiş mesajı kaydeder (sent_by ile) ve yayar.
  // Ekranına geçilerek gönderildiyse `asUserId` = adına gönderilen kullanıcı.
  recordPanelSend(input: {
    chatId: number;
    userId: number;
    asUserId: number | null;
    body: string;
    providerId: string | null;
  }): Promise<void>;
}

export interface LiveHub {
  // allow: her olaydan önce çağrılır (numberId null = numaradan bağımsız olay); false dönerse olay gönderilmez.
  subscribe(userId: number, send: (event: LiveEvent) => void, allow?: (numberId: number | null) => boolean): () => void;
  publish(numberId: number, event: LiveEvent): void;
  // Numaradan bağımsız olay (ör. etiket listesi değişti): tüm bağlı kullanıcılara.
  broadcast(event: LiveEvent): void;
}

export interface Notifier {
  readonly publicKey: string;
  notifyNumber(numberId: number, payload: { title: string; body: string; url?: string }, exceptUserId?: number): Promise<void>;
}

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "impersonate.start"
  | "impersonate.stop"
  | "message.send"
  | "chat.start"
  | "chat.assign"
  | "chat.status"
  | "chat.tags"
  | "chat.export"
  | "note.create"
  | "note.delete"
  | "tag.create"
  | "tag.update"
  | "tag.delete"
  | "audit.export"
  | "number.create"
  | "number.delete"
  | "number.pair"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "role.create"
  | "role.update"
  | "role.delete"
  | "quick_reply.create"
  | "quick_reply.update"
  | "quick_reply.delete";

export interface AuditLog {
  record(entry: {
    actor: SessionUser | null;
    asUser?: SessionUser | null;
    action: AuditAction;
    target?: string;
    detail?: string | null;
    numberId?: number | null; // numarayla ilgili kayıtlarda: görünürlük süzgeci için
  }): void;
}

export interface AppDeps {
  env: Env;
  db: Database;
  logger: Logger;
  provider: MessagingProvider;
  hub: LiveHub;
  notifier: Notifier;
  messages: MessageService;
  audit: AuditLog;
}

// Hono context değişkenleri (requireUser sonrası).
// user: etkin kullanıcı (ekranına geçilmişse hedef kullanıcı). actor: ekranına geçen gerçek kişi, yoksa null.
// resolve: oturumu veritabanına göre yeniden çözümler (uzun ömürlü bağlantılar için); geçersizse null.
export type AppEnv = {
  Variables: {
    user: SessionUser;
    actor: SessionUser | null;
    resolve: () => { user: SessionUser; actor: SessionUser | null } | null;
  };
};
