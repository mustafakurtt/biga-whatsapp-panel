// Ctrl/Cmd+K: tüm görülebilir numaralarda mesaj araması + hızlı geçişler.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { get, qs } from "../../api/client";
import { useNumbers } from "../../api/queries";
import type { SearchResult } from "../../api/types";
import { Icon, type IconName } from "../../components/Icon";
import { Dialog } from "../../components/overlays";
import { cx, Highlight } from "../../components/ui";
import { chatTitle, fmtListTime, lower, snippet } from "../../lib/format";
import { toggleTheme } from "../../lib/theme";
import { useStopImpersonation } from "../app/impersonation";
import { useAdminSections, useSession } from "../app/session";
import { chatPath, numberPath } from "../inbox/current";

interface Cmd {
  kind: "cmd";
  icon: IconName;
  label: string;
  hint: string;
  run: () => void;
}
type Item = Cmd | ({ kind: "result" } & SearchResult);

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ onClose, onImpersonate }: { onClose: () => void; onImpersonate: () => void }) {
  const navigate = useNavigate();
  const numbers = useNumbers();
  const sections = useAdminSections();
  const { has, isImpersonating } = useSession();
  const stop = useStopImpersonation();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const term = useDebounced(q.trim(), 220);

  const search = useQuery({
    queryKey: ["search", term],
    enabled: term.length >= 2,
    staleTime: 10_000,
    queryFn: async () => (await get<{ results: SearchResult[] }>(`/api/search${qs({ q: term })}`)).results ?? [],
  });

  const commands = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [];
    for (const n of numbers.data ?? []) c.push({ kind: "cmd", icon: "inbox", label: `${n.label} gelen kutusu`, hint: "Numara", run: () => navigate(numberPath(n.id)) });
    for (const s of sections) c.push({ kind: "cmd", icon: s.icon, label: s.label, hint: "Yönetim", run: () => navigate(`/yonetim/${s.id}`) });
    if (isImpersonating) c.push({ kind: "cmd", icon: "swap", label: "Kendi hesabıma dön", hint: "Hesap", run: () => void stop() });
    else if (has("impersonate.view")) c.push({ kind: "cmd", icon: "eye", label: "Ekranına geç…", hint: "Hesap", run: onImpersonate });
    c.push({ kind: "cmd", icon: "moon", label: "Temayı değiştir", hint: "Görünüm", run: toggleTheme });
    return c;
  }, [numbers.data, sections, isImpersonating, has, stop, navigate, onImpersonate]);

  const results = term.length >= 2 && q.trim().length >= 2 ? (search.data ?? []) : [];
  const ql = lower(q.trim());
  const cmds = commands.filter((c) => !ql || lower(c.label).includes(ql)).slice(0, q.trim() ? 4 : 8);
  const items: Item[] = [...results.map((r) => ({ kind: "result" as const, ...r })), ...cmds];
  const active = Math.min(index, Math.max(0, items.length - 1));

  useEffect(() => setIndex(0), [term]);
  useEffect(() => {
    listRef.current?.querySelector(".pal-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    onClose();
    if (it.kind === "result") navigate(chatPath(it.chat.number_id, it.chat.id));
    else it.run();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      setIndex((active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    }
  };

  const loading = q.trim().length >= 2 && (term !== q.trim() || search.isFetching);
  let status = "";
  if (loading) status = "Aranıyor…";
  else if (search.error) status = search.error.message;
  else if (q.trim().length >= 2 && !results.length) status = `"${q.trim()}" için mesaj bulunamadı.`;
  else if (q.trim().length === 1) status = "Aramak için en az 2 karakter yazın.";

  return (
    <Dialog kind="palette" label="Arama" onClose={onClose}>
      <div className="pal">
        <div className="pal-bar">
          <Icon name="search" size={18} className="pal-ico" />
          <input
            className="pal-input"
            type="search"
            placeholder="Mesajlarda ara ya da bir sayfaya git…"
            aria-label="Ara"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-activedescendant={items.length ? `pal-${active}` : undefined}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="pal-list" id="pal-list" role="listbox" ref={listRef}>
          {results.length > 0 && <div className="pal-group">Mesajlar · {results.length}{results.length >= 50 ? "+" : ""}</div>}
          {items.map((it, i) => {
            const groupHead = it.kind === "cmd" && (i === 0 || items[i - 1]?.kind !== "cmd") ? <div className="pal-group">Git</div> : null;
            const cls = cx("pal-item", it.kind === "result" ? "pal-result" : "pal-cmd", i === active && "active");
            const common = { id: `pal-${i}`, role: "option", "aria-selected": i === active, tabIndex: -1, className: cls, onClick: () => choose(i), onMouseMove: () => i !== active && setIndex(i) } as const;
            if (it.kind === "result") {
              const m = it.message;
              return (
                <button key={`r${m.id}`} type="button" {...common}>
                  <span className="pal-r-top">
                    <span className="pal-r-chat">{chatTitle(it.chat)}</span>
                    <span className="pal-r-num">{it.numberLabel}</span>
                    <span className="pal-r-time">{fmtListTime(m.ts)}</span>
                  </span>
                  <span className="pal-r-text">
                    {m.direction === "out" && <span className="pal-r-who">{m.source === "phone" ? "Telefondan: " : `${m.sent_by_name || "Panel"}: `}</span>}
                    <Highlight text={snippet(m.body, q.trim())} q={q.trim()} />
                  </span>
                </button>
              );
            }
            return (
              <div key={`c${i}`} style={{ display: "contents" }}>
                {groupHead}
                <button type="button" {...common}>
                  <Icon name={it.icon} size={16} />
                  <span className="pal-cmd-label">{it.label}</span>
                  <span className="pal-cmd-hint">{it.hint}</span>
                </button>
              </div>
            );
          })}
        </div>
        {status && <p className="pal-status" aria-live="polite">{status}</p>}
      </div>
    </Dialog>
  );
}
