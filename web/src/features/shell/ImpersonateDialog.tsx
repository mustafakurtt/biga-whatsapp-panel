// "Ekranına geç" seçici: GET /api/auth/impersonate/targets
import { useState } from "react";
import { useImpersonateTargets } from "../../api/queries";
import { Icon } from "../../components/Icon";
import { Dialog } from "../../components/overlays";
import { Avatar, BlockError } from "../../components/ui";
import { lower } from "../../lib/format";
import { useStartImpersonation } from "../app/impersonation";

export function ImpersonateDialog({ onClose }: { onClose: () => void }) {
  const targets = useImpersonateTargets();
  const start = useStartImpersonation();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const users = targets.data ?? [];
  const needle = lower(q.trim());
  const shown = users.filter((u) => !needle || lower(`${u.name} ${u.username} ${u.roleName}`).includes(needle));

  return (
    <Dialog title="Ekranına geç" className="dlg-imp" onClose={onClose}>
      <div className="form-stack">
        <p className="dlg-lead">Seçtiğiniz kişinin gördüğü numaraları ve sohbetleri onun erişimiyle görürsünüz. Yaptığınız her şey etkinlik kaydına ikinizin adıyla yazılır.</p>
        <div className="search-wrap">
          <Icon name="search" size={16} className="search-ico" />
          <input className="input input-search" type="search" placeholder="Kişi ara" aria-label="Kişi ara" autoComplete="off" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="imp-list" role="list">
          {targets.isPending && <p className="muted pad">Yükleniyor…</p>}
          {targets.error && <BlockError message={targets.error.message} onRetry={() => void targets.refetch()} />}
          {targets.isSuccess && !shown.length && (
            <p className="muted pad">{users.length ? "Eşleşen kişi yok." : "Ekranına geçebileceğiniz kimse yok. Yalnızca sizden daha az yetkili, aktif kullanıcılar listelenir."}</p>
          )}
          {shown.map((u) => (
            <button
              key={u.id}
              type="button"
              className="imp-row"
              role="listitem"
              disabled={busyId !== null}
              onClick={async () => {
                setBusyId(u.id);
                const ok = await start(u.id);
                setBusyId(null);
                if (ok) onClose();
              }}
            >
              <Avatar name={u.name} id={u.id} size="md" />
              <span className="imp-row-text">
                <span className="imp-row-name">{u.name}</span>
                <span className="imp-row-sub">@{u.username} · {u.roleName}</span>
              </span>
              <Icon name="chevronRight" size={16} className="imp-row-go" />
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
