// Zaman çizelgesi: mesajlar ve iç notlar ts sırasıyla, güne göre ayrılmış, aynı göndericinin ardışık mesajları gruplu.
// Kaydırma: alttaysa yeni mesajda alta yapışır; değilse "Yeni mesaj" düğmesi çıkar. Eskiler üste eklenince konum korunur.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { MessageView, Note } from "../../api/types";
import { Icon } from "../../components/Icon";
import { cx } from "../../components/ui";
import { dayKey, fmtClock, fmtDayLabel, fmtFull } from "../../lib/format";

const GROUP_GAP = 7 * 60 * 1000;

export type PendingMessage = MessageView & { pending: true; key: string };

type Item = { kind: "msg"; ts: number; m: MessageView | PendingMessage } | { kind: "note"; ts: number; n: Note };

function senderKey(m: MessageView): string {
  if (m.direction === "in") return "in";
  if (m.source === "phone") return "phone";
  return `p:${m.sent_by}:${m.as_user ?? ""}`;
}

export function Timeline(props: {
  messages: MessageView[];
  pending: PendingMessage[];
  notes: Note[];
  hasMore: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  onRetry: () => void;
  onLoadOlder: () => void;
  canDeleteNote: (n: Note) => boolean;
  onDeleteNote: (n: Note) => void;
}) {
  const { messages, pending, notes, hasMore, loading, loadingOlder } = props;
  const box = useRef<HTMLDivElement>(null);
  const last = useRef({ height: 0, top: 0, first: null as string | null, count: 0, initial: true });
  const [showJump, setShowJump] = useState(false);

  // Eski mesajlar henüz yüklenmediyse yüklü aralıktan eski notları gösterme (sıra bozulmasın)
  const floor = hasMore && messages.length ? (messages[0]?.ts ?? -Infinity) : -Infinity;
  const items: Item[] = [
    ...messages.map((m) => ({ kind: "msg" as const, ts: m.ts, m })),
    ...pending.map((m) => ({ kind: "msg" as const, ts: m.ts, m })),
    ...notes.filter((n) => n.ts >= floor).map((n) => ({ kind: "note" as const, ts: n.ts, n })),
  ].sort((a, b) => a.ts - b.ts);

  const firstKey = items[0] ? `${items[0].kind}:${items[0].kind === "msg" ? items[0].m.id : items[0].n.id}` : null;
  const lastItem = items[items.length - 1];

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const prev = last.current;
    const nearBottom = prev.height - prev.top - el.clientHeight < 140;
    if (prev.initial && items.length) {
      el.scrollTop = el.scrollHeight;
      prev.initial = false;
    } else if (prev.first && firstKey !== prev.first && items.length > prev.count) {
      // üste eski mesaj eklendi: okuma konumunu koru
      el.scrollTop = el.scrollHeight - prev.height + prev.top;
    } else if (items.length > prev.count) {
      const own = lastItem && ((lastItem.kind === "msg" && lastItem.m.direction === "out" && "pending" in lastItem.m) || lastItem.kind === "note");
      if (nearBottom || own) el.scrollTop = el.scrollHeight;
      else setShowJump(true);
    }
    last.current = { ...last.current, height: el.scrollHeight, top: el.scrollTop, first: firstKey, count: items.length };
  });

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    last.current.height = el.scrollHeight;
    last.current.top = el.scrollTop;
    if (el.scrollTop < 80 && hasMore && !loadingOlder) props.onLoadOlder();
    if (showJump && el.scrollHeight - el.scrollTop - el.clientHeight < 140) setShowJump(false);
  };

  const nodes: ReactNode[] = [];
  if (hasMore) {
    nodes.push(
      <div key="older" className="older">
        <button type="button" className="btn btn-sm btn-ghost" onClick={props.onLoadOlder} disabled={loadingOlder}>
          {loadingOlder ? "Yükleniyor…" : "Daha eski mesajlar"}
        </button>
      </div>,
    );
  } else if (messages.length) {
    nodes.push(<p key="start" className="msgs-start">Sohbetin başlangıcı</p>);
  }
  if (props.error) {
    nodes.push(
      <div key="err" className="msgs-error">
        <p>Mesajlar yüklenemedi: {props.error}</p>
        <button type="button" className="btn btn-sm" onClick={props.onRetry}>Tekrar dene</button>
      </div>,
    );
  } else if (!items.length && !loading) {
    nodes.push(<p key="none" className="msgs-none">Bu sohbette henüz mesaj yok.</p>);
  }
  let lastDay: string | null = null;
  let prev: MessageView | null = null;
  for (const it of items) {
    const dk = dayKey(it.ts);
    if (dk !== lastDay) {
      nodes.push(
        <div key={`d${dk}`} className="day-sep" role="separator">
          <span>{fmtDayLabel(it.ts)}</span>
        </div>,
      );
      lastDay = dk;
      prev = null;
    }
    if (it.kind === "note") {
      nodes.push(<NoteCard key={`n${it.n.id}`} note={it.n} canDelete={props.canDeleteNote(it.n)} onDelete={() => props.onDeleteNote(it.n)} />);
      prev = null;
      continue;
    }
    const m = it.m;
    const first = !prev || senderKey(prev) !== senderKey(m) || m.ts - prev.ts > GROUP_GAP;
    nodes.push(<Bubble key={"key" in m ? m.key : `m${m.id}`} m={m} first={first} />);
    prev = m;
  }

  return (
    <>
      <div ref={box} className={cx("msgs", loading && "is-loading")} role="log" aria-live="polite" aria-label="Mesajlar" tabIndex={0} onScroll={onScroll}>
        <div className="msgs-inner">{nodes}</div>
      </div>
      {showJump && (
        <button
          type="button"
          className="jump-new"
          onClick={() => {
            const el = box.current;
            if (el) el.scrollTop = el.scrollHeight;
            setShowJump(false);
          }}
        >
          <Icon name="chevronDown" size={14} />
          <span>Yeni mesaj</span>
        </button>
      )}
    </>
  );
}

function WhoLabel({ m }: { m: MessageView }) {
  if (m.direction !== "out") return null;
  if (m.source === "phone") {
    return (
      <span className="msg-who">
        <Icon name="phone" size={12} />
        <span>Telefondan</span>
      </span>
    );
  }
  return (
    <span className="msg-who">
      <span>{m.sent_by_name || "Panel"}</span>
      {m.as_user_name && <span className="msg-as"> · {m.as_user_name} olarak</span>}
    </span>
  );
}

function Bubble({ m, first }: { m: MessageView | PendingMessage; first: boolean }) {
  const pending = "pending" in m;
  return (
    <div className={cx("msg", m.direction === "out" ? "out" : "in", first && "first", pending && "pending", `src-${m.source}`)} data-id={m.id}>
      {first && <WhoLabel m={m} />}
      <div className="msg-bubble">
        <span className="msg-body">{m.body}</span>
        <span className="msg-time" title={fmtFull(m.ts)}>{pending ? "Gönderiliyor…" : fmtClock(m.ts)}</span>
      </div>
    </div>
  );
}

function NoteCard({ note, canDelete, onDelete }: { note: Note; canDelete: boolean; onDelete: () => void }) {
  return (
    <div className="note" data-note-id={note.id}>
      <div className="note-head">
        <Icon name="note" size={13} />
        <span className="note-label">İç not</span>
        <span className="note-who">
          {note.user_name || "—"}
          {note.as_user_name ? ` · ${note.as_user_name} olarak` : ""}
        </span>
        <span className="note-time" title={fmtFull(note.ts)}>{fmtClock(note.ts)}</span>
        {canDelete && (
          <button type="button" className="note-del" aria-label="Notu sil" title="Notu sil" onClick={onDelete}>
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>
      <p className="note-body">{note.body}</p>
    </div>
  );
}
