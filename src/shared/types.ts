// Modüller arası ortak tipler (sözleşme). Değiştirmeden önce tüm modüllere etkisi düşünülür.
import type { Permission } from "./permissions";

export type { Permission };

// Oturumdaki kullanıcı. `permissions` her zaman etkin izinlerdir (ekranına geçilmişse kısıtlanmış hali).
export interface SessionUser {
  id: number;
  username: string;
  name: string;
  roleId: number;
  roleName: string;
  permissions: Permission[];
}

export type NumberAccess = "read" | "write";

// WORKING: bağlı. SCAN_QR_CODE: eşleştirme bekliyor. STARTING: bağlanıyor.
// FAILED: telefondan çıkış yapıldı / yeniden eşleştirme gerekli. STOPPED: kapalı.
// RESTRICTED: WhatsApp kısıtladı (463); bağlı ama panelden gönderim geçici olarak durduruldu.
export type NumberStatus = "WORKING" | "SCAN_QR_CODE" | "STARTING" | "FAILED" | "STOPPED" | "RESTRICTED";

// baileys: gerçek WhatsApp numarası. mock: test numarası (WhatsApp'a gitmez).
export type ProviderKind = "baileys" | "mock";

export interface NumberRow {
  id: number;
  label: string;
  phone: string;
  provider: ProviderKind;
  session: string;
  status: NumberStatus;
  me_id: string | null;
  created_at: number;
}

export interface ChatRow {
  id: number;
  number_id: number;
  remote_id: string;
  name: string;
  last_text: string;
  last_message_at: number;
  unread: number;
  assigned_to: number | null;
  assigned_name: string | null;
  status: ChatStatus;
  tags: number[]; // etiket kimlikleri
}

export type ChatStatus = "open" | "closed";

export const TAG_COLORS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: number;
  name: string;
  color: TagColor;
}

// Ekip içi not (müşteri görmez).
export interface Note {
  id: number;
  chat_id: number;
  user_id: number | null;
  user_name: string;
  as_user_name: string | null;
  body: string;
  ts: number;
}

export interface Viewer {
  id: number;
  name: string;
}

export type MessageSource = "contact" | "phone" | "panel";

export interface MessageRow {
  id: number;
  chat_id: number;
  provider_id: string | null;
  direction: "in" | "out";
  source: MessageSource;
  sent_by: number | null;
  as_user: number | null; // ekranına geçilerek gönderildiyse kimin adına
  body: string;
  ts: number;
}

export type MessageView = MessageRow & { sent_by_name: string | null; as_user_name: string | null };

// Canlı akışla (SSE) ön yüze giden olaylar.
export type LiveEvent =
  | { type: "message"; numberId: number; chat: ChatRow; message: MessageView }
  | { type: "chat_updated"; numberId: number; chat: ChatRow }
  | { type: "note"; numberId: number; chatId: number; note: Note }
  | { type: "note_deleted"; numberId: number; chatId: number; noteId: number }
  | { type: "viewers"; numberId: number; chatId: number; viewers: Viewer[] }
  | { type: "tags_changed" }
  // Geçmiş eşitlemesi ya da rehber adları sohbet listesini toplu değiştirdi; liste yeniden okunur.
  | { type: "chats_synced"; numberId: number }
  | { type: "number_status"; numberId: number; status: NumberStatus };
