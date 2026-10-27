// Küçük, paylaşılan arayüz parçaları. Sınıf adları styles/app.css ile aynıdır.
import { useId, type ButtonHTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import type { NumberStatus, Tag } from "../api/types";
import { hueIndex, initials, lower } from "../lib/format";
import { Icon, type IconName } from "./Icon";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const STATUS: Record<NumberStatus, { label: string; tone: "ok" | "warn" | "pending" | "bad" | "off" }> = {
  WORKING: { label: "Bağlı", tone: "ok" },
  SCAN_QR_CODE: { label: "Eşleştirme bekliyor", tone: "warn" },
  STARTING: { label: "Bağlanıyor", tone: "pending" },
  FAILED: { label: "Yeniden eşleştirme gerekli", tone: "bad" },
  STOPPED: { label: "Kapalı", tone: "off" },
  RESTRICTED: { label: "Kısıtlandı", tone: "warn" },
};
export const statusOf = (s: NumberStatus | string) => STATUS[s as NumberStatus] ?? { label: s || "Bilinmiyor", tone: "off" as const };

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { icon: IconName; label: string; size?: number };
export function IconButton({ icon, label, size = 18, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={label} className={cx("icon-btn", className)} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; variant?: "primary" | "ghost" | "danger" | "danger-ghost"; size?: "sm" | "lg" };
export function Button({ icon, variant, size, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx("btn", variant && `btn-${variant}`, size && `btn-${size}`, className)} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children !== undefined && <span>{children}</span>}
    </button>
  );
}

export function Avatar({ name, id, size = "md", neutral = false, title }: { name: string | null | undefined; id?: number | string | null; size?: "xs" | "sm" | "md" | "lg"; neutral?: boolean; title?: string }) {
  return (
    <span className={cx("avatar", `avatar-${size}`, neutral ? "avatar-neutral" : `avatar-h${hueIndex(id ?? name)}`)} title={title ?? name ?? ""} aria-hidden={title ? undefined : true}>
      {initials(name)}
    </span>
  );
}

export function Pill({ tone = "neutral", icon, children }: { tone?: string; icon?: IconName; children: ReactNode }) {
  return (
    <span className={cx("pill", `pill-${tone}`)}>
      {icon && <Icon name={icon} size={12} />}
      <span>{children}</span>
    </span>
  );
}

export function StatusPill({ status }: { status: NumberStatus }) {
  const st = statusOf(status);
  return <Pill tone={st.tone}>{st.label}</Pill>;
}

export const StatusDot = ({ status }: { status: NumberStatus }) => <span className={cx("status-dot", `tone-${statusOf(status).tone}`)} aria-hidden="true" />;

/** Test (mock) numaralarının rozeti */
export const TestBadge = () => <span className="pill pill-test" title="Test numarası: mesajlar WhatsApp'a gitmez">Test</span>;

export function TagChip({ tag, small, onRemove }: { tag: Pick<Tag, "name" | "color"> | null | undefined; small?: boolean; onRemove?: () => void }) {
  if (!tag) return null;
  return (
    <span className={cx("tag-chip", `tag-${tag.color || "gray"}`, small && "tag-chip-sm")} title={tag.name}>
      <span className="tag-dot" aria-hidden="true" />
      <span className="tag-name">{tag.name}</span>
      {onRemove && (
        <button type="button" className="tag-x" aria-label={`${tag.name} etiketini kaldır`} onClick={onRemove}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}

/** Metni arama sözcüğüne göre <mark> ile işaretler (React metin düğümleriyle, güvenli). */
export function Highlight({ text, q }: { text: string; q: string }) {
  const s = String(text ?? "");
  const needle = lower(q.trim());
  if (!needle) return <>{s}</>;
  const hay = lower(s);
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < s.length) {
    const j = hay.indexOf(needle, i);
    if (j < 0) {
      out.push(s.slice(i));
      break;
    }
    if (j > i) out.push(s.slice(i, j));
    out.push(<mark key={k++}>{s.slice(j, j + needle.length)}</mark>);
    i = j + needle.length;
  }
  return <>{out}</>;
}

export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; error?: string; children: (id: string) => ReactElement }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="field-hint">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" className="switch-input" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
    </span>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, label, size, className }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; size?: "sm"; className?: string }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    const group = e.currentTarget.parentElement;
    requestAnimationFrame(() => (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  };
  return (
    <div className={cx("seg", size === "sm" && "seg-sm", className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" className="seg-btn" data-value={String(o.value)} aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)} onKeyDown={onKey}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyBlock({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-block">
      <p className="empty-title">{title}</p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function BlockError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="block-error" role="alert">
      <p>{message}</p>
      {onRetry && <Button size="sm" onClick={onRetry}>Tekrar dene</Button>}
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-title">
        <h1 className="h1">{title}</h1>
        {sub !== undefined && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/** Sunucudaki bir dosyayı indirir (çerez aynı kökenle gider). */
export function download(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  document.body.append(a);
  a.click();
  a.remove();
}
