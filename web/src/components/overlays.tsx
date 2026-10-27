// Uygulama genelindeki katmanlar: toast, onay penceresi, açılır menü ve <dialog> tabanlı Dialog.
// toast(), confirmDialog() ve openMenu() React dışından da çağrılabilir; ekrana <OverlayHost/> çizer.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UnauthorizedError } from "../api/client";
import { Icon, type IconName } from "./Icon";
import { cx } from "./ui";

// ---------- küçük mağaza ----------
function store<T>(initial: T) {
  let value = initial;
  const ls = new Set<() => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      ls.forEach((l) => l());
    },
    sub: (l: () => void) => {
      ls.add(l);
      return () => {
        ls.delete(l);
      };
    },
  };
}
const useStore = <T,>(s: ReturnType<typeof store<T>>) => useSyncExternalStore(s.sub, s.get);

// ---------- Toast ----------
interface ToastItem { id: number; msg: string; kind: "info" | "ok" | "error"; in: boolean }
const toasts = store<ToastItem[]>([]);
let toastSeq = 0;

export function toast(msg: string, kind: ToastItem["kind"] = "info"): void {
  const id = ++toastSeq;
  toasts.set([...toasts.get(), { id, msg, kind, in: false }]);
  requestAnimationFrame(() => toasts.set(toasts.get().map((t) => (t.id === id ? { ...t, in: true } : t))));
  setTimeout(() => {
    toasts.set(toasts.get().map((t) => (t.id === id ? { ...t, in: false } : t)));
    setTimeout(() => toasts.set(toasts.get().filter((t) => t.id !== id)), 250);
  }, kind === "error" ? 5000 : 3200);
}

export function showError(err: unknown): void {
  if (err instanceof UnauthorizedError) return;
  toast(err instanceof Error ? err.message : String(err), "error");
}

function Toasts() {
  const items = useStore(toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx("toast", `toast-${t.kind}`, t.in && "in")}>
          {t.kind === "error" && <Icon name="x" size={14} className="toast-ico" />}
          {t.kind === "ok" && <Icon name="check" size={14} className="toast-ico" />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Dialog ----------
export interface DialogProps {
  title?: string;
  label?: string;
  kind?: "modal" | "drawer" | "palette";
  className?: string;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** Bağlandığında showModal ile açılır; Esc, Kapat ya da arka plana tıklama onClose çağırır. */
export function Dialog({ title, label, kind = "modal", className, footer, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOutside = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("cancel", onCancel);
      if (d.open) d.close();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={cx("dlg", `dlg-${kind}`, className)}
      aria-label={label ?? title}
      onMouseDown={(e) => {
        downOutside.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOutside.current) onClose();
        downOutside.current = false;
      }}
    >
      <div className="dlg-inner">
        {title && (
          <header className="dlg-head">
            <h2 className="dlg-title">{title}</h2>
            <button type="button" className="icon-btn" aria-label="Kapat" title="Kapat (Esc)" onClick={onClose}>
              <Icon name="x" size={18} />
            </button>
          </header>
        )}
        <div className="dlg-body">{children}</div>
        {footer && <footer className="dlg-foot">{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
}

// ---------- Onay ----------
interface ConfirmReq { title: string; message: string; confirmText?: string; danger?: boolean; resolve: (ok: boolean) => void }
const confirmStore = store<ConfirmReq | null>(null);

export function confirmDialog(opts: Omit<ConfirmReq, "resolve">): Promise<boolean> {
  return new Promise((resolve) => confirmStore.set({ ...opts, resolve }));
}

function ConfirmHost() {
  const req = useStore(confirmStore);
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (req) setTimeout(() => (req.danger ? noRef : yesRef).current?.focus(), 0);
  }, [req]);
  if (!req) return null;
  const done = (ok: boolean) => {
    confirmStore.set(null);
    req.resolve(ok);
  };
  return (
    <Dialog
      title={req.title}
      className="dlg-confirm"
      onClose={() => done(false)}
      footer={
        <>
          <button ref={noRef} type="button" className="btn" onClick={() => done(false)}>Vazgeç</button>
          <button ref={yesRef} type="button" className={req.danger ? "btn btn-danger" : "btn btn-primary"} onClick={() => done(true)}>
            {req.confirmText ?? "Onayla"}
          </button>
        </>
      }
    >
      <p className="confirm-text">{req.message}</p>
    </Dialog>
  );
}

// ---------- Açılır menü ----------
export type MenuItem =
  | "sep"
  | { heading: string }
  | {
      label: string;
      icon?: IconName;
      swatch?: string;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      selected?: boolean;
      /** keep: çoklu seçim, menü açık kalır; onSelect yeni seçili durumu döner */
      keep?: boolean;
      onSelect?: () => void | boolean;
    };

interface MenuReq { anchor: HTMLElement; items: MenuItem[]; align: "start" | "end"; width?: number }
const menuStore = store<MenuReq | null>(null);

export function openMenu(anchor: HTMLElement, items: MenuItem[], opts: { align?: "start" | "end"; width?: number } = {}): void {
  menuStore.set({ anchor, items, align: opts.align ?? "start", width: opts.width });
}
export const closeMenu = () => menuStore.set(null);

function MenuHost() {
  const req = useStore(menuStore);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [, force] = useState(0);

  useLayoutEffect(() => {
    if (!req || !ref.current) {
      setPos(null);
      return;
    }
    const r = req.anchor.getBoundingClientRect();
    const m = ref.current;
    const mw = m.offsetWidth;
    const mh = m.offsetHeight;
    let left = req.align === "end" ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    setPos({ left, top });
    req.anchor.setAttribute("aria-expanded", "true");
    const first = m.querySelector<HTMLButtonElement>(".menu-item:not(:disabled)");
    first?.focus();
    const anchor = req.anchor;
    return () => anchor.setAttribute("aria-expanded", "false");
  }, [req]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)") ?? [])];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        req.anchor.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        btns[(i + 1) % btns.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        btns[(i - 1 + btns.length) % btns.length]?.focus();
      } else if (e.key === "Tab") closeMenu();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !req.anchor.contains(t)) closeMenu();
    };
    document.addEventListener("keydown", onKey, true);
    const tm = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    window.addEventListener("resize", closeMenu);
    return () => {
      clearTimeout(tm);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", closeMenu);
    };
  }, [req]);

  if (!req) return null;
  // Menü <dialog> içinden açıldıysa üst katmanda kalsın diye o dialog'un içine çizilir.
  const host = req.anchor.closest("dialog") ?? document.body;
  return createPortal(
    <div ref={ref} className="menu" role="menu" style={{ width: req.width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      {req.items.map((it, idx) => {
        if (it === "sep") return <div key={idx} className="menu-sep" role="separator" />;
        if ("heading" in it) return <div key={idx} className="menu-heading">{it.heading}</div>;
        return (
          <button
            key={idx}
            type="button"
            role={it.keep ? "menuitemcheckbox" : "menuitem"}
            aria-checked={it.keep ? Boolean(it.selected) : undefined}
            className={cx("menu-item", it.danger && "danger", it.selected && "selected")}
            disabled={it.disabled}
            onClick={() => {
              if (it.keep) {
                const r = it.onSelect?.();
                it.selected = typeof r === "boolean" ? r : !it.selected;
                force((n) => n + 1);
                return;
              }
              closeMenu();
              it.onSelect?.();
            }}
          >
            {it.swatch ? <span className={`tag-dot tag-${it.swatch}`} /> : it.icon ? <Icon name={it.icon} size={16} /> : <span className="menu-ico-pad" />}
            <span className="menu-label">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            <Icon name="check" size={14} className="menu-check" style={{ visibility: it.selected ? "visible" : "hidden" }} />
          </button>
        );
      })}
    </div>,
    host,
  );
}

export function OverlayHost() {
  return (
    <>
      <Toasts />
      <ConfirmHost />
      <MenuHost />
    </>
  );
}
