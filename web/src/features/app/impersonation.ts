// Oturum geçişleri: ekranına geç / kendi hesabına dön / çıkış. Önbellek kişiye özel olduğu için temizlenir.
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { post } from "../../api/client";
import { qk } from "../../api/queries";
import type { Me } from "../../api/types";
import { closeMenu, showError, toast } from "../../components/overlays";

function useSwitchSession() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (me: Me | null) => {
    closeMenu();
    // Kişiye özel tüm veriyi at (numaralar, sohbetler, mesajlar…); yapılandırma kalır.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "config" });
    qc.setQueryData(qk.me, me);
    navigate("/", { replace: true });
  };
}

export function useStartImpersonation(): (userId: number) => Promise<boolean> {
  const switchTo = useSwitchSession();
  return async (userId) => {
    try {
      const me = await post<Me>("/api/auth/impersonate", { userId });
      switchTo(me);
      toast(`${me.user.name} kullanıcısının ekranındasınız`, "ok");
      return true;
    } catch (err) {
      showError(err);
      return false;
    }
  };
}

export function useStopImpersonation(): () => Promise<void> {
  const switchTo = useSwitchSession();
  return async () => {
    try {
      const me = await post<Me>("/api/auth/impersonate/stop");
      switchTo(me);
      toast("Kendi hesabınıza döndünüz", "ok");
    } catch (err) {
      showError(err);
    }
  };
}

export function useLogout(): () => Promise<void> {
  const switchTo = useSwitchSession();
  return async () => {
    try {
      await post("/api/auth/logout");
    } catch {
      // önemsiz
    }
    switchTo(null);
  };
}
