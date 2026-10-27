// Modüller arası ortak tipler (sözleşme). Değiştirmeden önce tüm modüllere etkisi düşünülür.

export type Role = "patron" | "temsilci" | "salt_okunur";

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

export interface NumberRow {
  id: number;
  label: string;
  phone: string;
  session: string;
  status: string;
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
}

export type MessageSource = "contact" | "phone" | "panel";

export interface MessageRow {
  id: number;
  chat_id: number;
  provider_id: string | null;
  direction: "in" | "out";
  source: MessageSource;
  sent_by: number | null;
  body: string;
  ts: number;
}

// Canlı akışla (SSE) ön yüze giden olaylar.
export type LiveEvent =
  | { type: "message"; numberId: number; chat: ChatRow; message: MessageRow & { sent_by_name: string | null } }
  | { type: "number_status"; numberId: number; status: string };
