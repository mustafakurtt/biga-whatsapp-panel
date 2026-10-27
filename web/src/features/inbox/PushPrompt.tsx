// Bildirim daveti: sohbet listesinin üstünde küçük kart.
// - İzin henüz sorulmadıysa: "Bildirimleri aç".
// - iOS Safari'de (ana ekrana eklenmemiş): push yalnızca ana ekrandan açılan uygulamada çalışır; nasıl ekleneceğini anlatır.
import { useState } from "react";
import { Icon } from "../../components/Icon";
import { showError, toast } from "../../components/overlays";
import { Button } from "../../components/ui";
import { enablePush, needsInstallForPush, usePush } from "../../lib/push";
import { useSession } from "../app/session";

const KEY = "pushPromptDismissedAt";
const SNOOZE = 7 * 24 * 3600 * 1000;

function dismissedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) || 0) < SNOOZE;
  } catch {
    return false;
  }
}

export function PushPrompt() {
  const push = usePush();
  const { isImpersonating } = useSession();
  const [hidden, setHidden] = useState(dismissedRecently);
  const [busy, setBusy] = useState(false);

  if (!push.ready || hidden || isImpersonating || !push.serverEnabled) return null;
  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // önemsiz
    }
    setHidden(true);
  };

  if (needsInstallForPush()) {
    return (
      <div className="push-card" role="note">
        <Icon name="bell" size={18} className="push-ico" />
        <div className="push-text">
          <p className="push-title">Bildirim için ana ekrana ekleyin</p>
          <p className="push-sub">
            iPhone'da bildirim yalnızca ana ekrandan açılan uygulamada çalışır. Safari'de <strong>Paylaş</strong> › <strong>Ana Ekrana Ekle</strong>, sonra Biga Panel'i ana ekrandan açıp bildirimleri açın.
          </p>
        </div>
        <div className="push-actions">
          <Button size="sm" variant="ghost" onClick={later}>Şimdi değil</Button>
        </div>
      </div>
    );
  }

  if (!push.supported || push.permission !== "default" || push.subscribed) return null;
  return (
    <div className="push-card" role="note">
      <Icon name="bell" size={18} className="push-ico" />
      <div className="push-text">
        <p className="push-title">Yeni mesajlarda bildirim alın</p>
        <p className="push-sub">Uygulama kapalıyken de müşteri yazınca bildirim gelir; dokununca sohbet açılır.</p>
      </div>
      <div className="push-actions">
        <Button
          size="sm"
          variant="primary"
          icon="bell"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await enablePush();
              toast("Bu cihazda bildirimler açıldı", "ok");
            } catch (err) {
              showError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          Bildirimleri aç
        </Button>
        <Button size="sm" variant="ghost" onClick={later}>Şimdi değil</Button>
      </div>
    </div>
  );
}
