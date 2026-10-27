// Oturum bağlamı ve izin yardımcıları. `user.permissions` her zaman etkin izinlerdir.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Me, NumberView, Permission, SessionUser } from "../../api/types";

export interface Session {
  user: SessionUser;
  actor: SessionUser | null;
  /** Ekranına geçilmişse gerçek kişi (actor), değilse kullanıcı */
  self: SessionUser;
  isImpersonating: boolean;
  has: (p: Permission) => boolean;
  /** Etkin yazma: numarada write erişimi + messages.send */
  canSendOn: (n: NumberView | null | undefined) => boolean;
  canStartOn: (n: NumberView | null | undefined) => boolean;
  /** Not: izleme modunda (ekranına geçilmiş, gönderme hakkı yok) yazılamaz; salt okunur kullanıcı yazabilir. */
  canNote: boolean;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  const value = useMemo<Session>(() => {
    const perms = new Set(me.user.permissions);
    const has = (p: Permission) => perms.has(p);
    const canSendOn = (n: NumberView | null | undefined) => Boolean(n && n.access === "write" && has("messages.send"));
    return {
      user: me.user,
      actor: me.actor,
      self: me.actor ?? me.user,
      isImpersonating: Boolean(me.actor),
      has,
      canSendOn,
      canStartOn: (n) => canSendOn(n) && has("chats.start") && n?.status !== "RESTRICTED",
      canNote: !me.actor || has("messages.send"),
    };
  }, [me]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("SessionProvider eksik");
  return s;
}

export interface AdminSection {
  id: string;
  label: string;
  icon: "phone" | "users" | "shield" | "bolt" | "tag" | "list" | "chart";
  perm: Permission;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: "numaralar", label: "Numaralar", icon: "phone", perm: "numbers.manage" },
  { id: "kullanicilar", label: "Kullanıcılar", icon: "users", perm: "users.manage" },
  { id: "roller", label: "Roller", icon: "shield", perm: "users.manage" },
  { id: "hazir-yanitlar", label: "Hazır yanıtlar", icon: "bolt", perm: "quick_replies.manage" },
  { id: "etiketler", label: "Etiketler", icon: "tag", perm: "tags.manage" },
  { id: "etkinlik", label: "Etkinlik kaydı", icon: "list", perm: "audit.view" },
  { id: "raporlar", label: "Raporlar", icon: "chart", perm: "reports.view" },
];

export const useAdminSections = () => {
  const { has } = useSession();
  return ADMIN_SECTIONS.filter((s) => has(s.perm));
};
