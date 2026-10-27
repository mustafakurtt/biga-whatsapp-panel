// API yanıt tipleri. Sunucuyla ortak olanlar src/shared/types.ts'ten (sadece tip olarak) gelir;
// docs/api.md'de olup types.ts'te olmayan yanıt biçimleri burada tanımlanır.
import type {
  ChatRow,
  MessageView,
  NumberAccess,
  NumberRow,
  Permission,
  SessionUser,
} from "@shared/types";

export type {
  ChatRow,
  ChatStatus,
  LiveEvent,
  MessageSource,
  MessageView,
  Note,
  NumberAccess,
  NumberStatus,
  Permission,
  ProviderKind,
  SessionUser,
  Tag,
  TagColor,
  Viewer,
} from "@shared/types";

/** GET /api/auth/me, login, impersonate: `actor` doluysa actor, user'ın ekranındadır. */
export interface Me {
  user: SessionUser;
  actor: SessionUser | null;
}

/** GET /api/numbers satırı: NumberRow'un istemciye giden hali + erişim ve okunmamış toplamı. */
export type NumberView = Pick<NumberRow, "id" | "label" | "phone" | "provider" | "status" | "me_id"> & {
  access: NumberAccess;
  unread: number;
};

export interface ManagedUser {
  id: number;
  username: string;
  name: string;
  roleId: number;
  roleName: string;
  active: boolean;
  lastLoginAt: number | null;
  numbers: { numberId: number; access: NumberAccess }[];
}

export interface Role {
  id: number;
  name: string;
  permissions: Permission[];
  system: boolean;
  userCount: number;
}

export interface PermissionInfo {
  key: Permission;
  label: string;
  group: string;
}

export interface ImpersonateTarget {
  id: number;
  username: string;
  name: string;
  roleName: string;
}

export interface QuickReply {
  id: number;
  title: string;
  body: string;
}

export type AuditAction =
  | "auth.login" | "auth.login_failed" | "auth.logout"
  | "impersonate.start" | "impersonate.stop"
  | "message.send" | "chat.start" | "chat.assign" | "chat.status" | "chat.tags" | "chat.export"
  | "note.create" | "note.delete"
  | "tag.create" | "tag.update" | "tag.delete"
  | "audit.export"
  | "number.create" | "number.delete" | "number.pair"
  | "user.create" | "user.update" | "user.delete"
  | "role.create" | "role.update" | "role.delete"
  | "quick_reply.create" | "quick_reply.update" | "quick_reply.delete";

export interface AuditEntry {
  id: number;
  ts: number;
  actor_id: number | null;
  actor_name: string;
  as_user_id: number | null;
  as_user_name: string | null;
  action: AuditAction | (string & {});
  target: string;
  detail: string | null;
}

export interface Summary {
  days: number;
  totals: { incoming: number; outgoing: number; panel: number; phone: number; chats: number };
  response: { averageMs: number | null; medianMs: number | null; samples: number };
  daily: { day: string; incoming: number; outgoing: number }[];
  perNumber: { numberId: number; label: string; incoming: number; outgoing: number }[];
  perUser: { userId: number; name: string; sent: number; replies: number; avgResponseMs: number | null }[];
}

export interface SearchResult {
  chat: ChatRow;
  message: MessageView;
  numberLabel: string;
}

export interface AppConfig {
  mockAllowed: boolean;
  defaultProvider: "baileys" | "mock";
  pushEnabled: boolean;
}

export type ChatFilter = "all" | "unread" | "mine" | "unassigned";
export type StatusFilter = "open" | "closed" | "all";

export interface ChatQuery {
  filter: ChatFilter;
  status: StatusFilter;
  tag: number | null;
  q: string;
}
