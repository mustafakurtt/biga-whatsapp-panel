// Yazma kutusu: "Mesaj" ve "İç not" modları; "/" ile hazır yanıt seçici; Enter gönderir, Shift+Enter yeni satır.
// Dokunmatik cihazda Enter yeni satırdır (gönder düğmesi var). Alt+N modlar arasında geçer.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuickReplies } from "../../api/queries";
import type { QuickReply } from "../../api/types";
import { Icon, type IconName } from "../../components/Icon";
import { cx, IconButton } from "../../components/ui";
import { lower } from "../../lib/format";

export type ComposerMode = "message" | "note";
export interface ReadonlyReason {
  text: string;
  icon: IconName;
  tone?: "warn";
}

const coarse = window.matchMedia("(pointer: coarse)");

export function ReadonlyNote({ reason, compact }: { reason: ReadonlyReason | null; compact?: boolean }) {
  return (
    <div className={cx("readonly-note", reason?.tone === "warn" && "is-warn", compact && "compact")}>
      <Icon name={reason?.icon ?? "lock"} size={16} />
      <span>{reason?.text ?? "Bu sohbete mesaj gönderemezsiniz."}</span>
    </div>
  );
}

export function Composer({ sendOk, noteOk, reason, warn, canManageReplies, onSendMessage, onSendNote }: {
  sendOk: boolean;
  noteOk: boolean;
  reason: ReadonlyReason | null;
  warn: string | null;
  canManageReplies: boolean;
  onSendMessage: (text: string) => void;
  onSendNote: (text: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<ComposerMode>(sendOk ? "message" : "note");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<{ open: boolean; mode: "slash" | "append"; index: number }>({ open: false, mode: "slash", index: 0 });
  const area = useRef<HTMLTextAreaElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const replies = useQuickReplies(picker.open);

  useEffect(() => {
    if (!sendOk && mode === "message") setMode("note");
    if (!noteOk && mode === "note") setMode("message");
  }, [sendOk, noteOk, mode]);

  useEffect(() => {
    if (!coarse.matches) area.current?.focus({ preventScroll: true });
  }, []);

  // Otomatik yükseklik
  useLayoutEffect(() => {
    const a = area.current;
    if (!a) return;
    a.style.height = "auto";
    a.style.height = `${Math.min(a.scrollHeight, 180)}px`;
  }, [text]);

  const slash = mode === "message" ? /^\/(\S*)$/.exec(text) : null;
  const pickerOpen = mode === "message" && (picker.open || Boolean(slash));
  const query = picker.mode === "slash" || slash ? (slash?.[1] ?? "") : "";
  const list = (replies.data ?? []).filter((r) => !query || lower(r.title).includes(lower(query)) || lower(r.body).includes(lower(query)));
  const index = Math.min(picker.index, Math.max(0, list.length - 1));

  useEffect(() => {
    if (slash && !picker.open) setPicker({ open: true, mode: "slash", index: 0 });
    if (!slash && picker.open && picker.mode === "slash") setPicker((p) => ({ ...p, open: false }));
  }, [slash, picker.open, picker.mode]);

  useEffect(() => {
    pop.current?.querySelector(".qr-item.active")?.scrollIntoView({ block: "nearest" });
  }, [index, pickerOpen]);

  const closePicker = () => setPicker((p) => ({ ...p, open: false }));

  const choose = (r: QuickReply | undefined) => {
    if (!r) return;
    const next = picker.mode === "slash" || slash ? r.body : `${text.replace(/\s*$/, "")}${text.trim() ? " " : ""}${r.body}`;
    setText(next);
    closePicker();
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(next.length, next.length);
    });
  };

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    if (mode === "note") {
      setBusy(true);
      const ok = await onSendNote(t);
      setBusy(false);
      if (ok) setText("");
    } else {
      if (slash) return;
      setText("");
      closePicker();
      onSendMessage(t);
    }
    area.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.altKey && (e.key === "n" || e.key === "N") && sendOk && noteOk) {
      e.preventDefault();
      setMode((m) => (m === "note" ? "message" : "note"));
      return;
    }
    if (pickerOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (list.length) setPicker((p) => ({ ...p, index: (index + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length }));
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && list.length) {
        e.preventDefault();
        choose(list[index]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (slash) setText("");
        closePicker();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !coarse.matches) {
      e.preventDefault();
      void submit();
    }
  };

  const note = mode === "note";
  return (
    <form className={cx("composer", note && "is-note")} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {pickerOpen && (
        <div className="qr-pop" role="listbox" aria-label="Hazır yanıtlar" ref={pop}>
          <div className="qr-head"><span>Hazır yanıtlar</span><span className="qr-keys">↑↓ seç · Enter ekle · Esc kapat</span></div>
          {replies.isPending ? (
            <p className="qr-empty">Hazır yanıtlar yükleniyor…</p>
          ) : !list.length ? (
            <p className="qr-empty">
              {replies.data?.length ? `"${query}" ile eşleşen hazır yanıt yok.` : canManageReplies ? "Henüz hazır yanıt yok. Yönetim › Hazır yanıtlar'dan ekleyin." : "Henüz hazır yanıt eklenmemiş."}
            </p>
          ) : (
            list.map((r, i) => (
              <button key={r.id} type="button" role="option" aria-selected={i === index} tabIndex={-1} className={cx("qr-item", i === index && "active")} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}>
                <span className="qr-title">{r.title}</span>
                <span className="qr-body">{r.body}</span>
              </button>
            ))
          )}
        </div>
      )}
      {!sendOk && <ReadonlyNote reason={reason} compact />}
      {sendOk && noteOk && (
        <div className="composer-modes" role="radiogroup" aria-label="Yazma türü">
          {([["message", "Mesaj", "message"], ["note", "İç not", "note"]] as const).map(([id, label, ic]) => (
            <button key={id} type="button" role="radio" className="mode-btn" data-mode={id} aria-checked={mode === id} onClick={() => { setMode(id); area.current?.focus(); }}>
              <Icon name={ic} size={14} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="composer-box">
        {!note && (
          <IconButton
            icon="bolt"
            label="Hazır yanıtlar ( / )"
            className="composer-tool"
            onClick={() => {
              if (pickerOpen) {
                if (slash) setText("");
                closePicker();
                return;
              }
              if (!text) {
                setText("/");
                setPicker({ open: true, mode: "slash", index: 0 });
              } else setPicker({ open: true, mode: "append", index: 0 });
              area.current?.focus();
            }}
          />
        )}
        <textarea
          ref={area}
          className="composer-input"
          rows={1}
          enterKeyHint="send"
          aria-label={note ? "İç not" : "Mesaj"}
          aria-expanded={pickerOpen}
          placeholder={note ? "Ekibe iç not yazın — müşteri görmez" : "Mesaj yazın…  ( / hazır yanıtlar)"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => { if (!pop.current?.contains(document.activeElement) && picker.mode === "append") closePicker(); }, 150)}
        />
        <button type="submit" className="send-btn" disabled={busy} aria-label={note ? "Notu kaydet" : "Gönder"} title={note ? "Notu kaydet (Enter)" : "Gönder (Enter)"}>
          <Icon name="send" size={18} />
        </button>
      </div>
      <div className="composer-hint">
        {warn && <p className="composer-warn">{warn}</p>}
        <span className="composer-keys">{note ? "Enter kaydeder · Shift+Enter yeni satır · Not sadece ekibe görünür" : "Enter gönderir · Shift+Enter yeni satır · / hazır yanıt"}</span>
      </div>
    </form>
  );
}
