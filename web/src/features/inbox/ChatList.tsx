// Sohbet listesi: başlık (numara), filtre sekmeleri, arama, durum/etiket süzgeci, satırlar.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { useChats, useTags } from "../../api/queries";
import type { ChatFilter, ChatQuery, ChatRow, NumberView, StatusFilter, Tag } from "../../api/types";
import { Icon } from "../../components/Icon";
import { openMenu, type MenuItem } from "../../components/overlays";
import { Avatar, BlockError, cx, Highlight, IconButton, Pill, StatusPill, TagChip, TestBadge } from "../../components/ui";
import { chatTitle, fmtListTime, fmtPhone, nf, remoteLabel } from "../../lib/format";
import { useSession } from "../app/session";
import { chatPath } from "./current";
import { NewChatDialog } from "./NewChatDialog";
import { PushPrompt } from "./PushPrompt";

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "unread", label: "Okunmamış" },
  { id: "mine", label: "Bana atanan" },
  { id: "unassigned", label: "Atanmamış" },
];
const STATUS_OPTS: { id: StatusFilter; label: string; menu: string }[] = [
  { id: "open", label: "Açık", menu: "Açık sohbetler" },
  { id: "closed", label: "Kapalı", menu: "Kapalı sohbetler" },
  { id: "all", label: "Hepsi", menu: "Hepsi (açık ve kapalı)" },
];

export function ChatList({ number, query, setQuery, activeChatId }: { number: NumberView | null; query: ChatQuery; setQuery: (fn: (q: ChatQuery) => ChatQuery) => void; activeChatId: number | null }) {
  const { has, canStartOn } = useSession();
  const tags = useTags();
  const chats = useChats(number?.id ?? null, query);
  const navigate = useNavigate();
  const location = useLocation();
  const [text, setText] = useState(query.q);
  const [newOpen, setNewOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Arama kutusu 250 ms gecikmeyle sorguya yansır
  useEffect(() => setText(query.q), [query.q]);
  useEffect(() => {
    if (text.trim() === query.q) return;
    const t = setTimeout(() => setQuery((q) => ({ ...q, q: text.trim() })), 250);
    return () => clearTimeout(t);
  }, [text, query.q, setQuery]);

  const tagById = (id: number) => tags.data?.find((t) => t.id === id) ?? null;
  const activeTag = query.tag !== null ? tagById(query.tag) : null;
  const rows = chats.data ?? [];

  // Alt+↑/↓: önceki/sonraki sohbet
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || !number || !rows.length || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      const i = rows.findIndex((c) => c.id === activeChatId);
      const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) navigate(chatPath(number.id, next.id), { replace: Boolean(activeChatId) });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rows, activeChatId, number, navigate]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = FILTERS[(i + (e.key === "ArrowRight" ? 1 : -1) + FILTERS.length) % FILTERS.length];
    if (!n) return;
    setQuery((q) => ({ ...q, filter: n.id }));
    requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLElement>(`[data-filter="${n.id}"]`)?.focus());
  };

  const openFilterMenu = (anchor: HTMLElement) => {
    const items: MenuItem[] = [{ heading: "Durum" }];
    for (const o of STATUS_OPTS) items.push({ label: o.menu, selected: query.status === o.id, onSelect: () => setQuery((q) => ({ ...q, status: o.id })) });
    items.push("sep", { heading: "Etiket" }, { label: "Tüm etiketler", selected: query.tag === null, onSelect: () => setQuery((q) => ({ ...q, tag: null })) });
    for (const t of tags.data ?? []) items.push({ label: t.name, swatch: t.color, selected: query.tag === t.id, onSelect: () => setQuery((q) => ({ ...q, tag: t.id })) });
    if (!tags.data?.length) items.push({ label: "Henüz etiket yok", disabled: true });
    openMenu(anchor, items, { align: "end", width: 240 });
  };

  const st = STATUS_OPTS.find((o) => o.id === query.status) ?? STATUS_OPTS[0]!;
  const openChat = (c: ChatRow) => {
    if (!number) return;
    // Telefonda geri düğmesi listeye dönsün diye sohbeti listeden açarken geçmişe ekle
    const fromChat = Boolean(activeChatId);
    navigate(chatPath(number.id, c.id), { replace: fromChat, state: { fromList: fromChat ? (location.state as { fromList?: boolean } | null)?.fromList : true } });
  };

  return (
    <section className="list-col" aria-label="Sohbetler">
      <div className="list-head">
        <div className="list-title">
          <h1 className="h1">{number ? number.label : "Gelen kutusu"}</h1>
          {number && (
            <div className="list-sub">
              <span className="num">{fmtPhone(number.phone)}</span>
              <StatusPill status={number.status} />
              {number.provider === "mock" && <TestBadge />}
              {number.access === "read" && <Pill icon="eye">Sadece okuma</Pill>}
            </div>
          )}
        </div>
        {number && canStartOn(number) && <IconButton icon="plus" label="Yeni sohbet" className="icon-btn-solid" onClick={() => setNewOpen(true)} />}
      </div>

      {number && (
        <div className="list-tools">
          <div className="tabs" role="tablist" aria-label="Sohbet filtresi" ref={tabsRef}>
            {FILTERS.map((f, i) => (
              <button key={f.id} type="button" role="tab" className="tab" data-filter={f.id} aria-selected={query.filter === f.id} tabIndex={query.filter === f.id ? 0 : -1} onClick={() => setQuery((q) => ({ ...q, filter: f.id }))} onKeyDown={(e) => onTabKey(e, i)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="search-row">
            <div className="search-wrap">
              <Icon name="search" size={16} className="search-ico" />
              <input
                className="input input-search"
                type="search"
                placeholder="Sohbetlerde ara"
                aria-label="Sohbetlerde ara"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && text) {
                    e.preventDefault();
                    setText("");
                    setQuery((q) => ({ ...q, q: "" }));
                  }
                }}
              />
            </div>
            <button type="button" className={cx("filter-btn", (query.status !== "open" || activeTag) && "is-active")} title="Durum ve etiket filtresi" aria-haspopup="menu" aria-expanded="false" onClick={(e) => openFilterMenu(e.currentTarget)}>
              <Icon name={query.status === "closed" ? "checkCircle" : "inbox"} size={15} />
              <span className="filter-text">{st.label}</span>
              {activeTag && <span className={`tag-dot tag-${activeTag.color}`} title={activeTag.name} />}
              {activeTag && <span className="filter-text filter-tag">{activeTag.name}</span>}
              <Icon name="chevronDown" size={14} />
            </button>
          </div>
        </div>
      )}

      <PushPrompt />

      <ul className="chat-list">
        {!number ? (
          <li className="list-empty">
            {has("numbers.manage") ? "Henüz bağlı numara yok. Yönetim › Numaralar'dan ekleyin." : "Size henüz bir numara atanmadı. Yöneticinizden erişim isteyin."}
          </li>
        ) : chats.isPending ? (
          Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="chat-row is-skeleton" aria-hidden="true">
              <span className="sk sk-avatar" />
              <span className="sk-lines"><span className="sk sk-line w60" /><span className="sk sk-line w85" /></span>
            </li>
          ))
        ) : chats.error ? (
          <li><BlockError message={`Sohbetler yüklenemedi: ${chats.error.message}`} onRetry={() => void chats.refetch()} /></li>
        ) : !rows.length ? (
          <li className="list-empty">{emptyText(query)}</li>
        ) : (
          rows.map((c) => <ChatRowItem key={c.id} chat={c} active={c.id === activeChatId} q={query.q} tagById={tagById} onOpen={() => openChat(c)} />)
        )}
      </ul>
      {newOpen && number && <NewChatDialog number={number} onClose={() => setNewOpen(false)} />}
    </section>
  );
}

function emptyText(q: ChatQuery): string {
  if (q.q) return `"${q.q}" ile eşleşen sohbet yok.`;
  if (q.tag !== null) return `Bu etiketle eşleşen ${q.status === "closed" ? "kapalı " : q.status === "open" ? "açık " : ""}sohbet yok.`;
  if (q.status === "closed") return q.filter === "all" ? "Kapalı sohbet yok." : "Bu filtrede kapalı sohbet yok.";
  if (q.status === "open" && q.filter === "all") return "Açık sohbet yok. Kapatılanları görmek için filtreden Kapalı'yı seçin.";
  return {
    all: "Bu numaraya henüz mesaj gelmedi.",
    unread: "Okunmamış sohbet yok. Hepsi yanıtlanmış.",
    mine: "Size atanmış sohbet yok.",
    unassigned: "Atanmamış sohbet yok. Her sohbetin bir sorumlusu var.",
  }[q.filter];
}

function ChatRowItem({ chat: c, active, q, tagById, onOpen }: { chat: ChatRow; active: boolean; q: string; tagById: (id: number) => Tag | null; onOpen: () => void }) {
  const title = chatTitle(c);
  const phone = fmtPhone(remoteLabel(c.remote_id));
  const unread = c.unread > 0;
  const tags = (c.tags ?? []).map(tagById).filter((t): t is Tag => Boolean(t));
  return (
    <li>
      <button type="button" className={cx("chat-row", active && "active", unread && "unread")} aria-current={active ? "true" : undefined} data-id={c.id} onClick={onOpen}>
        <Avatar name={title} size="md" neutral />
        <span className="chat-main">
          <span className="chat-line1">
            <span className="chat-name"><Highlight text={title} q={q} /></span>
            {title !== phone && <span className="chat-phone num">{phone}</span>}
            {c.status === "closed" && (
              <span className="closed-mark" title="Kapalı sohbet"><Icon name="checkCircle" size={13} /><span>Kapalı</span></span>
            )}
            <time className="chat-time" dateTime={new Date(c.last_message_at || 0).toISOString()}>{fmtListTime(c.last_message_at)}</time>
          </span>
          <span className="chat-line2">
            <span className="chat-last"><Highlight text={c.last_text || ""} q={q} /></span>
            <span className="chat-meta">
              {unread && <span className="count" aria-label={`${c.unread} okunmamış`}>{c.unread > 99 ? "99+" : nf.format(c.unread)}</span>}
              {c.assigned_to && <Avatar name={c.assigned_name || "?"} id={c.assigned_to} size="xs" title={`Sorumlu: ${c.assigned_name || "—"}`} />}
            </span>
          </span>
          {tags.length > 0 && (
            <span className="chat-tags">
              {tags.slice(0, 3).map((t) => <TagChip key={t.id} tag={t} small />)}
              {tags.length > 3 && <span className="tag-more">+{tags.length - 3}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
