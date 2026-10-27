// TanStack Query anahtarları ve okuma kancaları. Canlı akış (live.ts) bu önbelleği setQueryData ile günceller.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { get, qs } from "./client";
import type {
  AppConfig,
  AuditEntry,
  ChatQuery,
  ChatRow,
  ImpersonateTarget,
  ManagedUser,
  Me,
  MessageView,
  Note,
  NumberView,
  PermissionInfo,
  QuickReply,
  Role,
  Summary,
  Tag,
  Viewer,
} from "./types";

export const PAGE_SIZE = 100;

export const qk = {
  me: ["me"] as const,
  config: ["config"] as const,
  numbers: ["numbers"] as const,
  tags: ["tags"] as const,
  chatsAll: ["chats"] as const,
  chatsOf: (numberId: number) => ["chats", numberId] as const,
  chats: (numberId: number, q: ChatQuery) => ["chats", numberId, q] as const,
  chat: (id: number) => ["chat", id] as const,
  messages: (chatId: number) => ["messages", chatId] as const,
  notes: (chatId: number) => ["notes", chatId] as const,
  viewers: (chatId: number) => ["viewers", chatId] as const,
  quickReplies: ["quickReplies"] as const,
  users: ["users"] as const,
  roles: ["roles"] as const,
  permissions: ["permissions"] as const,
  impTargets: ["impTargets"] as const,
  audit: (f: { userId: string; action: string }) => ["audit", f] as const,
  report: (days: number) => ["report", days] as const,
};

/** Mesaj sayfası: eski→yeni; hasMore = daha eskiler var. */
export interface MessagesPage {
  messages: MessageView[];
  hasMore: boolean;
}

export const fetchMe = () => get<Me>("/api/auth/me");

export function useConfig() {
  return useQuery({
    queryKey: qk.config,
    queryFn: async (): Promise<AppConfig> => {
      try {
        return await get<AppConfig>("/api/config");
      } catch {
        return { mockAllowed: false, defaultProvider: "baileys", pushEnabled: false };
      }
    },
    staleTime: Infinity,
  });
}

export function useNumbers() {
  return useQuery({
    queryKey: qk.numbers,
    queryFn: async () => (await get<{ numbers: NumberView[] }>("/api/numbers")).numbers ?? [],
  });
}

export function useTags() {
  return useQuery({
    queryKey: qk.tags,
    queryFn: async () => (await get<{ tags: Tag[] }>("/api/tags")).tags ?? [],
    staleTime: 5 * 60_000,
  });
}

export function useChats(numberId: number | null, q: ChatQuery) {
  return useQuery({
    queryKey: qk.chats(numberId ?? 0, q),
    enabled: numberId !== null,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await get<{ chats: ChatRow[] }>(
        `/api/numbers/${numberId}/chats${qs({
          filter: q.filter === "all" ? "" : q.filter,
          status: q.status === "all" ? "" : q.status,
          tag: q.tag,
          q: q.q,
        })}`,
      )).chats ?? [],
  });
}

export function useChat(chatId: number | null, initial?: ChatRow) {
  return useQuery({
    queryKey: qk.chat(chatId ?? 0),
    enabled: chatId !== null,
    initialData: initial,
    queryFn: async () => (await get<{ chat: ChatRow }>(`/api/chats/${chatId}`)).chat,
  });
}

export function useMessages(chatId: number | null) {
  return useQuery({
    queryKey: qk.messages(chatId ?? 0),
    enabled: chatId !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<MessagesPage> => {
      const { messages } = await get<{ messages: MessageView[] }>(`/api/chats/${chatId}/messages`);
      return { messages: messages ?? [], hasMore: (messages ?? []).length >= PAGE_SIZE };
    },
  });
}

export function useNotes(chatId: number | null) {
  return useQuery({
    queryKey: qk.notes(chatId ?? 0),
    enabled: chatId !== null,
    staleTime: 30_000,
    queryFn: async () => (await get<{ notes: Note[] }>(`/api/chats/${chatId}/notes`)).notes ?? [],
  });
}

export function useViewers(chatId: number | null) {
  return useQuery<Viewer[]>({
    queryKey: qk.viewers(chatId ?? 0),
    enabled: false, // sadece kalp atışı ve canlı olaylarla dolar
    initialData: [],
    queryFn: () => [],
  });
}

export function useQuickReplies(enabled = true) {
  return useQuery({
    queryKey: qk.quickReplies,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => (await get<{ items: QuickReply[] }>("/api/quick-replies")).items ?? [],
  });
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: qk.users,
    enabled,
    queryFn: async () => (await get<{ users: ManagedUser[] }>("/api/users")).users ?? [],
  });
}

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: qk.roles,
    enabled,
    queryFn: async () => (await get<{ roles: Role[] }>("/api/roles")).roles ?? [],
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: qk.permissions,
    enabled,
    staleTime: Infinity,
    queryFn: async () => (await get<{ permissions: PermissionInfo[] }>("/api/permissions")).permissions ?? [],
  });
}

export function useImpersonateTargets(enabled = true) {
  return useQuery({
    queryKey: qk.impTargets,
    enabled,
    queryFn: async () => (await get<{ users: ImpersonateTarget[] }>("/api/auth/impersonate/targets")).users ?? [],
  });
}

export function useReport(days: number) {
  return useQuery({
    queryKey: qk.report(days),
    placeholderData: keepPreviousData,
    queryFn: () => get<Summary>(`/api/reports/summary?days=${days}`),
  });
}

export const fetchAuditPage = (f: { userId: string; action: string }, before?: number) =>
  get<{ entries: AuditEntry[] }>(`/api/audit${qs({ before, userId: f.userId, action: f.action })}`).then((r) => r.entries ?? []);
