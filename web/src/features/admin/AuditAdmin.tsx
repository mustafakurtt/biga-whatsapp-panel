// Yönetim › Etkinlik kaydı: kim, ne zaman, ne yaptı. Filtreler: kişi, işlem. Daha fazlası: before=<son id>.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { errorMessage, qs } from "../../api/client";
import { fetchAuditPage, PAGE_SIZE, useUsers } from "../../api/queries";
import type { AuditEntry } from "../../api/types";
import { Avatar, BlockError, Button, PageHead, cx, download } from "../../components/ui";
import { dayKey, fmtClock, fmtDayLabel, fmtFull } from "../../lib/format";
import { useSession } from "../app/session";

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Giriş yaptı",
  "auth.login_failed": "Hatalı giriş denemesi",
  "auth.logout": "Çıkış yaptı",
  "impersonate.start": "Ekranına geçti",
  "impersonate.stop": "Kendi hesabına döndü",
  "message.send": "Mesaj gönderdi",
  "chat.start": "Yeni sohbet başlattı",
  "chat.assign": "Sohbet atadı",
  "chat.status": "Sohbet durumunu değiştirdi",
  "chat.tags": "Etiketleri değiştirdi",
  "chat.export": "Sohbeti indirdi",
  "note.create": "Not ekledi",
  "note.delete": "Not sildi",
  "tag.create": "Etiket ekledi",
  "tag.update": "Etiketi güncelledi",
  "tag.delete": "Etiket sildi",
  "audit.export": "Kaydı indirdi",
  "number.create": "Numara ekledi",
  "number.delete": "Numara sildi",
  "number.pair": "Eşleştirme kodu aldı",
  "user.create": "Kullanıcı ekledi",
  "user.update": "Kullanıcıyı güncelledi",
  "user.delete": "Kullanıcı sildi",
  "role.create": "Rol ekledi",
  "role.update": "Rolü güncelledi",
  "role.delete": "Rol sildi",
  "quick_reply.create": "Hazır yanıt ekledi",
  "quick_reply.update": "Hazır yanıtı güncelledi",
  "quick_reply.delete": "Hazır yanıt sildi",
};

const TONE: Record<string, "bad" | "warn"> = { "auth.login_failed": "bad", "impersonate.start": "warn", "impersonate.stop": "warn" };

export function AuditAdmin() {
  const { has } = useSession();
  const canUsers = has("users.manage");
  const users = useUsers(canUsers).data ?? [];
  const [filter, setFilter] = useState({ userId: "", action: "" });
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    setMoreError(null);
    setEntries([]);
    try {
      const got = await fetchAuditPage(filter);
      if (my !== seq.current) return;
      setEntries(got);
      setHasMore(got.length >= PAGE_SIZE);
    } catch (err) {
      if (my !== seq.current) return;
      setError(errorMessage(err));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = async () => {
    const last = entries[entries.length - 1];
    if (loading || !last) return;
    const my = seq.current;
    setLoading(true);
    setMoreError(null);
    try {
      const got = await fetchAuditPage(filter, last.id);
      if (my !== seq.current) return;
      setEntries((list) => {
        const known = new Set(list.map((e) => e.id));
        return list.concat(got.filter((e) => !known.has(e.id)));
      });
      setHasMore(got.length >= PAGE_SIZE);
    } catch (err) {
      if (my === seq.current) setMoreError(errorMessage(err));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  };

  const filtered = Boolean(filter.userId || filter.action);
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const rows: ReactNode[] = [];
  let lastDay: string | null = null;
  for (const e of entries) {
    const dk = dayKey(e.ts);
    if (dk !== lastDay) {
      rows.push(<div key={`d-${dk}`} className="audit-day">{fmtDayLabel(e.ts)}</div>);
      lastDay = dk;
    }
    rows.push(<EntryRow key={e.id} e={e} />);
  }

  return (
    <>
      <PageHead
        title="Etkinlik kaydı"
        sub={loading && !entries.length ? "Yükleniyor…" : `${entries.length}${hasMore ? "+" : ""} kayıt${filtered ? " · filtreli" : ""} · yeniden eskiye`}
        actions={has("data.export") && (
          <Button icon="download" title="Seçili filtrelerle en fazla 10.000 kayıt" onClick={() => download(`/api/audit/export${qs(filter)}`)}>
            İndir (CSV)
          </Button>
        )}
      />
      <div className="filters">
        {canUsers && (
          <select className="input select select-sm" aria-label="Kişi" value={filter.userId} onChange={(e) => setFilter((f) => ({ ...f, userId: e.target.value }))}>
            <option value="">Herkes</option>
            {sortedUsers.map((u) => <option key={u.id} value={String(u.id)}>{u.name}</option>)}
          </select>
        )}
        <select className="input select select-sm" aria-label="İşlem" value={filter.action} onChange={(e) => setFilter((f) => ({ ...f, action: e.target.value }))}>
          <option value="">Tüm işlemler</option>
          {Object.entries(ACTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <div className="panel panel-flush audit">
        {error ? (
          <BlockError message={`Etkinlik kaydı yüklenemedi: ${error}`} onRetry={() => void reload()} />
        ) : loading && !entries.length ? (
          <p className="pad muted">Yükleniyor…</p>
        ) : !entries.length ? (
          <p className="pad muted">{filtered ? "Bu filtreyle eşleşen kayıt yok." : "Henüz kayıt yok."}</p>
        ) : (
          rows
        )}
      </div>
      <div className="load-more">
        {moreError ? (
          <BlockError message={moreError} onRetry={() => void loadMore()} />
        ) : hasMore ? (
          <Button disabled={loading} onClick={() => void loadMore()}>{loading ? "Yükleniyor…" : "Daha eski kayıtlar"}</Button>
        ) : entries.length ? (
          <p className="muted small">Kaydın başı.</p>
        ) : null}
      </div>
    </>
  );
}

function EntryRow({ e }: { e: AuditEntry }) {
  const label = ACTION_LABELS[e.action] ?? e.action;
  const tone = TONE[e.action];
  return (
    <div className="audit-row">
      <time className="audit-time num" dateTime={new Date(e.ts).toISOString()} title={fmtFull(e.ts)}>{fmtClock(e.ts)}</time>
      <Avatar name={e.actor_name || "?"} id={e.actor_id ?? e.actor_name} size="sm" />
      <div className="audit-main">
        <p className="audit-line">
          <strong>{e.actor_name || "Bilinmeyen"}</strong>
          {e.as_user_name && <span className="audit-as"> ({e.as_user_name} olarak)</span>}{" "}
          <span className={cx("audit-action", tone && `tone-text-${tone}`)}>{label}</span>
        </p>
        {(e.target || e.detail) && (
          <p className="audit-sub">
            {e.target && <span className="audit-target">{e.target}</span>}
            {e.target && e.detail && <span className="audit-dot"> · </span>}
            {e.detail && <span className="audit-detail">{e.detail}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
