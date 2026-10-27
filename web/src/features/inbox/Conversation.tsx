// Açık sohbet: başlık (atama, kapat/aç, işlemler), etiket + "bakıyor" şeridi, zaman çizelgesi, yazma kutusu.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { del, get, post, put } from "../../api/client";
import { applyChatUpdate, upsertNote } from "../../api/cache";
import { PAGE_SIZE, qk, useChat, useMessages, useNotes, useRoles, useTags, useUsers, useViewers, type MessagesPage } from "../../api/queries";
import type { ChatRow, MessageView, Note, NumberView, Tag, Viewer } from "../../api/types";
import { Icon } from "../../components/Icon";
import { confirmDialog, openMenu, showError, toast, type MenuItem } from "../../components/overlays";
import { Avatar, Button, cx, download, IconButton, Pill, TagChip } from "../../components/ui";
import { chatTitle, fmtPhone, remoteLabel } from "../../lib/format";
import { setOpenChatId } from "../app/live";
import { useSession, type Session } from "../app/session";
import { Composer, ReadonlyNote, type ReadonlyReason } from "./Composer";
import { chatPath, numberPath } from "./current";
import { Timeline, type PendingMessage } from "./Timeline";

function findCachedChat(qc: ReturnType<typeof useQueryClient>, chatId: number): ChatRow | undefined {
  const one = qc.getQueryData<ChatRow>(qk.chat(chatId));
  if (one) return one;
  for (const [, list] of qc.getQueriesData<ChatRow[]>({ queryKey: qk.chatsAll })) {
    const c = list?.find((x) => x.id === chatId);
    if (c) return c;
  }
  return undefined;
}

function readOnlyReason(s: Session, n: NumberView): ReadonlyReason | null {
  if (s.isImpersonating && !s.has("messages.send")) return { text: "İzleme modundasınız, mesaj gönderemezsiniz.", icon: "eye" };
  if (!s.has("messages.send")) return { text: "Rolünüzde mesaj gönderme izni yok. Mesajları okuyabilirsiniz.", icon: "lock" };
  if (n.access !== "write") return { text: "Bu numarada sadece okuma erişiminiz var.", icon: "eye" };
  if (n.status === "RESTRICTED") return { text: "WhatsApp bu numarayı geçici olarak kısıtladı; panelden gönderim 24 saat durduruldu. Gelen mesajlar akmaya devam ediyor.", icon: "lock", tone: "warn" };
  return null;
}

export function Conversation({ chatId, number }: { chatId: number; number: NumberView }) {
  const qc = useQueryClient();
  const session = useSession();
  const { user, self } = session;
  const navigate = useNavigate();
  const location = useLocation();
  const chatQ = useChat(chatId, findCachedChat(qc, chatId));
  const messagesQ = useMessages(chatId);
  const notesQ = useNotes(chatId);
  const viewers = useViewers(chatId).data ?? [];
  const tags = useTags();
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const chat = chatQ.data;

  // Bu sohbet listede süzgece uymasa da kalsın (ör. kapatınca "Açık" listesinden hemen düşmesin)
  useEffect(() => {
    setOpenChatId(chatId);
    return () => setOpenChatId(null);
  }, [chatId]);

  // Sohbet başka numaraya aitse doğru adrese geç
  useEffect(() => {
    if (chat && chat.number_id !== number.id) navigate(chatPath(chat.number_id, chat.id), { replace: true });
  }, [chat, number.id, navigate]);

  // Okundu: açılınca ve görünürken yeni mesaj gelince (ekranına geçmişken sunucuda etkisiz, yerelde de sıfırlamayız)
  const unread = chat?.unread ?? 0;
  const markRead = useCallback(() => {
    const c = qc.getQueryData<ChatRow>(qk.chat(chatId));
    if (!c || !c.unread || session.isImpersonating || document.visibilityState !== "visible") return;
    applyChatUpdate(qc, { ...c, unread: 0 }, user.id, { keepId: chatId });
    post(`/api/chats/${chatId}/read`).catch(showError);
  }, [qc, chatId, session.isImpersonating, user.id]);
  useEffect(() => {
    if (unread > 0 && messagesQ.isSuccess) markRead();
  }, [unread, messagesQ.isSuccess, markRead]);
  useEffect(() => {
    const onVis = () => markRead();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  // "Bakıyor" kalp atışı: hemen ve 20 sn'de bir
  useEffect(() => {
    const ping = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await post<{ viewers: Viewer[] }>(`/api/chats/${chatId}/viewing`);
        qc.setQueryData(qk.viewers(chatId), res.viewers ?? []);
      } catch {
        // önemsiz
      }
    };
    void ping();
    const t = setInterval(ping, 20_000);
    return () => clearInterval(t);
  }, [chatId, qc]);

  // Gerçek mesaj gelince aynı metinli bekleyen balonu düşür
  const messages = messagesQ.data?.messages ?? [];
  useEffect(() => {
    if (!pending.length) return;
    setPending((list) => list.filter((p) => !messages.some((m) => m.direction === "out" && m.body === p.body && m.ts >= p.ts - 60_000)));
  }, [messages, pending.length]);

  const loadOlder = async () => {
    const page = qc.getQueryData<MessagesPage>(qk.messages(chatId));
    const first = page?.messages[0];
    if (!page || !page.hasMore || !first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { messages: older } = await get<{ messages: MessageView[] }>(`/api/chats/${chatId}/messages?before=${encodeURIComponent(first.ts)}`);
      qc.setQueryData<MessagesPage>(qk.messages(chatId), (p) => {
        if (!p) return p;
        const known = new Set(p.messages.map((m) => m.id));
        return { messages: [...(older ?? []).filter((m) => !known.has(m.id)), ...p.messages], hasMore: (older ?? []).length >= PAGE_SIZE };
      });
    } catch (err) {
      showError(err);
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendMessage = async (text: string) => {
    const key = `p${Date.now()}${Math.random()}`;
    const p: PendingMessage = {
      key, pending: true, id: -Date.now(), chat_id: chatId, provider_id: null, direction: "out", source: "panel",
      sent_by: self.id, sent_by_name: self.name, as_user: session.actor ? user.id : null, as_user_name: session.actor ? user.name : null,
      body: text, ts: Date.now(),
    };
    setPending((list) => [...list, p]);
    try {
      await post(`/api/chats/${chatId}/messages`, { text });
      // Mesajın kendisi canlı akıştan gelir; gelmezse (akış kopuksa) sunucudan tazele.
      setTimeout(() => {
        setPending((list) => {
          if (list.some((x) => x.key === key)) void qc.invalidateQueries({ queryKey: qk.messages(chatId) });
          return list.filter((x) => x.key !== key);
        });
      }, 3000);
    } catch (err) {
      setPending((list) => list.filter((x) => x.key !== key));
      showError(err);
    }
  };

  const sendNote = async (text: string) => {
    try {
      const { note } = await post<{ note: Note }>(`/api/chats/${chatId}/notes`, { text });
      if (note) upsertNote(qc, chatId, note);
      return true;
    } catch (err) {
      showError(err);
      return false;
    }
  };

  const deleteNote = async (n: Note) => {
    const ok = await confirmDialog({ title: "Not silinsin mi?", message: "Not ekipten herkes için kalkar.", confirmText: "Sil", danger: true });
    if (!ok) return;
    try {
      await del(`/api/chats/${chatId}/notes/${n.id}`);
      qc.setQueryData<Note[]>(qk.notes(chatId), (list) => list?.filter((x) => x.id !== n.id));
    } catch (err) {
      showError(err);
    }
  };

  const updateChat = (c: ChatRow) => applyChatUpdate(qc, c, user.id, { keepId: chatId });

  if (chatQ.error && !chat) {
    return (
      <div className="conv-empty">
        <div className="conv-empty-inner">
          <Icon name="message" size={28} className="conv-empty-ico" />
          <p className="conv-empty-title">Sohbet açılamadı</p>
          <p className="conv-empty-sub">{chatQ.error.message}</p>
          <Button size="sm" onClick={() => navigate(numberPath(number.id), { replace: true })}>Listeye dön</Button>
        </div>
      </div>
    );
  }

  const reason = readOnlyReason(session, number);
  const sendOk = !reason && session.canSendOn(number);
  const noteOk = session.canNote;
  const back = () => {
    if ((location.state as { fromList?: boolean } | null)?.fromList) navigate(-1);
    else navigate(numberPath(number.id), { replace: true });
  };

  return (
    <div className="conv">
      <ConvHeader chat={chat} number={number} onBack={back} onUpdated={updateChat} />
      {chat && <MetaBar chat={chat} number={number} tags={tags.data ?? []} viewers={viewers} onUpdated={updateChat} />}
      <Timeline
        messages={messages}
        pending={pending}
        notes={notesQ.data ?? []}
        hasMore={messagesQ.data?.hasMore ?? false}
        loading={messagesQ.isPending}
        loadingOlder={loadingOlder}
        error={messagesQ.error ? messagesQ.error.message : null}
        onRetry={() => void messagesQ.refetch()}
        onLoadOlder={() => void loadOlder()}
        canDeleteNote={(n) => n.user_id === self.id || session.has("users.manage")}
        onDeleteNote={(n) => void deleteNote(n)}
      />
      <footer className="conv-foot">
        {sendOk || noteOk ? (
          <Composer
            key={`${sendOk}|${noteOk}`}
            sendOk={sendOk}
            noteOk={noteOk}
            reason={reason}
            warn={sendOk && number.status !== "WORKING" ? "Numara şu an bağlı değil; mesaj gönderilemeyebilir." : null}
            canManageReplies={session.has("quick_replies.manage")}
            onSendMessage={(t) => void sendMessage(t)}
            onSendNote={sendNote}
          />
        ) : (
          <ReadonlyNote reason={reason} />
        )}
      </footer>
    </div>
  );
}

// ---------- Başlık ----------

function ConvHeader({ chat, number, onBack, onUpdated }: { chat: ChatRow | undefined; number: NumberView; onBack: () => void; onUpdated: (c: ChatRow) => void }) {
  const session = useSession();
  const title = chatTitle(chat);
  const phone = chat ? fmtPhone(remoteLabel(chat.remote_id)) : "";
  return (
    <header className="conv-head">
      <IconButton icon="back" label="Sohbet listesine dön" className="conv-back" onClick={onBack} />
      <Avatar name={title || "?"} size="lg" neutral />
      <div className="conv-ident">
        <h2 className="conv-name">{title || "…"}</h2>
        <p className="conv-sub">
          {title !== phone && <span className="num">{phone}</span>}
          <span className="conv-number"><Icon name="inbox" size={13} /><span>{number.label}</span></span>
        </p>
      </div>
      {chat && (
        <div className="conv-actions">
          <StatusButton chat={chat} number={number} onUpdated={onUpdated} />
          <AssignControl chat={chat} number={number} onUpdated={onUpdated} />
          <MoreButton chat={chat} number={number} onUpdated={onUpdated} canExport={session.has("data.export")} />
        </div>
      )}
    </header>
  );
}

async function setStatus(chat: ChatRow, status: "open" | "closed", onUpdated: (c: ChatRow) => void) {
  try {
    const res = await put<{ chat: ChatRow }>(`/api/chats/${chat.id}/status`, { status });
    if (res.chat) onUpdated(res.chat);
    toast(status === "closed" ? "Sohbet kapatıldı. Müşteri yazarsa yeniden açılır." : "Sohbet yeniden açıldı", "ok");
  } catch (err) {
    showError(err);
  }
}

function StatusButton({ chat, number, onUpdated }: { chat: ChatRow; number: NumberView; onUpdated: (c: ChatRow) => void }) {
  const { canSendOn } = useSession();
  const [busy, setBusy] = useState(false);
  const closed = chat.status === "closed";
  if (!canSendOn(number)) return closed ? <span className="status-pill"><Pill icon="checkCircle">Kapalı</Pill></span> : null;
  return (
    <button
      type="button"
      className="btn btn-sm status-btn"
      disabled={busy}
      title={closed ? "Sohbeti yeniden aç" : "Sohbeti kapat (iş bitti)"}
      onClick={async () => {
        setBusy(true);
        await setStatus(chat, closed ? "open" : "closed", onUpdated);
        setBusy(false);
      }}
    >
      <Icon name={closed ? "reopen" : "checkCircle"} size={15} />
      <span>{closed ? "Yeniden aç" : "Kapat"}</span>
    </button>
  );
}

function AssignControl({ chat, number, onUpdated }: { chat: ChatRow; number: NumberView; onUpdated: (c: ChatRow) => void }) {
  const { user, has, canSendOn } = useSession();
  const write = canSendOn(number);
  const canAssignOthers = has("chats.assign");
  const canList = canAssignOthers && has("users.manage");
  const users = useUsers(canList);
  const roles = useRoles(canList);
  const mine = chat.assigned_to === user.id;
  const label = chat.assigned_to ? chat.assigned_name || "—" : "Atanmamış";
  const [busy, setBusy] = useState(false);
  const interactive = canAssignOthers || write;

  const candidates = useMemo(() => {
    const viewAll = new Set((roles.data ?? []).filter((r) => r.permissions.includes("numbers.view_all")).map((r) => r.id));
    const list = (users.data ?? []).filter((u) => u.active && (viewAll.has(u.roleId) || u.numbers.some((x) => x.numberId === chat.number_id))).map((u) => ({ id: u.id, name: u.name }));
    if (!list.some((u) => u.id === user.id)) list.unshift({ id: user.id, name: user.name });
    return list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [users.data, roles.data, chat.number_id, user.id, user.name]);

  const assign = async (userId: number | null) => {
    setBusy(true);
    try {
      const res = await put<{ chat: ChatRow }>(`/api/chats/${chat.id}/assign`, { userId });
      if (res.chat) onUpdated(res.chat);
      toast(userId === null ? "Atama kaldırıldı" : userId === user.id ? "Sohbeti üstlendiniz" : `Sohbet ${res.chat?.assigned_name || "kişiye"} atandı`, "ok");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  const openAssignMenu = (anchor: HTMLElement) => {
    const items: MenuItem[] = [];
    if (canList) {
      items.push({ heading: "Sorumlu seçin" });
      for (const u of candidates) items.push({ label: u.id === user.id ? `${u.name} (siz)` : u.name, selected: chat.assigned_to === u.id, onSelect: () => void assign(u.id) });
    } else if ((write && (!chat.assigned_to || mine)) || canAssignOthers) {
      if (!mine) items.push({ label: "Bana ata", icon: "user", onSelect: () => void assign(user.id) });
    }
    if (chat.assigned_to && (canAssignOthers || (write && mine))) {
      if (items.length) items.push("sep");
      items.push({ label: "Atamayı kaldır", icon: "x", onSelect: () => void assign(null) });
    }
    if (!items.length) items.push({ label: write ? "Bu sohbet başkasına atanmış" : "Atama için yazma erişimi gerekli", disabled: true });
    openMenu(anchor, items, { align: "end", width: 240 });
  };

  return (
    <div className="assign">
      {write && !chat.assigned_to && (
        <Button size="sm" variant="primary" icon="user" disabled={busy} onClick={() => void assign(user.id)}>Üstlen</Button>
      )}
      {interactive ? (
        <button type="button" className={cx("assign-chip", !chat.assigned_to && "is-empty")} title={chat.assigned_to ? `Sorumlu: ${label}` : "Bu sohbetin sorumlusu yok"} aria-haspopup="menu" aria-label={`Sorumlu: ${label}. Değiştir`} disabled={busy} onClick={(e) => openAssignMenu(e.currentTarget)}>
          {chat.assigned_to ? <Avatar name={label} id={chat.assigned_to} size="xs" /> : <Icon name="user" size={14} />}
          <span className="assign-name">{label}</span>
          <Icon name="chevronDown" size={14} />
        </button>
      ) : (
        <span className={cx("assign-chip is-static", !chat.assigned_to && "is-empty")} title={chat.assigned_to ? `Sorumlu: ${label}` : "Bu sohbetin sorumlusu yok"}>
          {chat.assigned_to ? <Avatar name={label} id={chat.assigned_to} size="xs" /> : <Icon name="user" size={14} />}
          <span className="assign-name">{label}</span>
        </span>
      )}
    </div>
  );
}

function MoreButton({ chat, number, onUpdated, canExport }: { chat: ChatRow; number: NumberView; onUpdated: (c: ChatRow) => void; canExport: boolean }) {
  const { canSendOn } = useSession();
  const items: MenuItem[] = [];
  if (canSendOn(number)) {
    const closed = chat.status === "closed";
    items.push({ label: closed ? "Yeniden aç" : "Sohbeti kapat", icon: closed ? "reopen" : "checkCircle", onSelect: () => void setStatus(chat, closed ? "open" : "closed", onUpdated) });
    items.push({
      label: "Etiketler…",
      icon: "tag",
      onSelect: () => {
        const btn = document.querySelector<HTMLElement>(".tag-add") ?? document.querySelector<HTMLElement>(".conv-more");
        btn?.click();
      },
    });
  }
  if (canExport) items.push({ label: "İndir (CSV)", icon: "download", onSelect: () => download(`/api/chats/${chat.id}/export`) });
  if (!items.length) return null;
  return <IconButton icon="more" label="Sohbet işlemleri" className="conv-more" aria-haspopup="menu" onClick={(e) => openMenu(e.currentTarget, items, { align: "end", width: 220 })} />;
}

// ---------- Etiket + bakanlar şeridi ----------

function MetaBar({ chat, number, tags, viewers, onUpdated }: { chat: ChatRow; number: NumberView; tags: Tag[]; viewers: Viewer[]; onUpdated: (c: ChatRow) => void }) {
  const qc = useQueryClient();
  const { canSendOn, user, actor, has } = useSession();
  const write = canSendOn(number);
  const seq = useRef(0);
  const chatTags = (chat.tags ?? []).map((id) => tags.find((t) => t.id === id)).filter((t): t is Tag => Boolean(t));
  const others = viewers.filter((v) => v.id !== user.id && (!actor || v.id !== actor.id));

  const save = async (tagIds: number[]) => {
    const prev = chat;
    const s = ++seq.current;
    qc.setQueryData(qk.chat(chat.id), { ...chat, tags: tagIds }); // iyimser
    try {
      const res = await put<{ chat: ChatRow }>(`/api/chats/${chat.id}/tags`, { tagIds });
      if (res.chat && s === seq.current) onUpdated(res.chat);
    } catch (err) {
      showError(err);
      if (s === seq.current) qc.setQueryData(qk.chat(chat.id), prev);
    }
  };

  const openPicker = (anchor: HTMLElement) => {
    if (!tags.length) {
      openMenu(anchor, [{ label: has("tags.manage") ? "Henüz etiket yok. Yönetim › Etiketler'den ekleyin." : "Henüz etiket tanımlanmamış.", disabled: true }], { width: 300 });
      return;
    }
    const current = new Set(chat.tags ?? []);
    openMenu(anchor, [
      { heading: "Etiketler" },
      ...tags.map((t): MenuItem => ({
        label: t.name,
        swatch: t.color,
        keep: true,
        selected: current.has(t.id),
        onSelect: () => {
          const on = !current.has(t.id);
          if (on) current.add(t.id);
          else current.delete(t.id);
          void save([...current]);
          return on;
        },
      })),
    ], { width: 240 });
  };

  if (!chatTags.length && !write && !others.length) return null;
  const first = (v: Viewer) => String(v.name || "").split(/\s+/)[0];
  const viewersText =
    others.length === 0 ? ""
      : others.length === 1 ? `${first(others[0]!)} de bu sohbete bakıyor`
      : others.length === 2 ? `${first(others[0]!)} ve ${first(others[1]!)} de bu sohbete bakıyor`
        : `${first(others[0]!)}, ${first(others[1]!)} ve ${others.length - 2} kişi daha bakıyor`;

  return (
    <div className="conv-meta">
      <div className="meta-tags">
        {chatTags.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={write ? () => void save((chat.tags ?? []).filter((id) => id !== t.id)) : undefined} />
        ))}
        {write && (
          <button type="button" className="tag-add" aria-haspopup="menu" onClick={(e) => openPicker(e.currentTarget)}>
            <Icon name={chatTags.length ? "plus" : "tag"} size={13} />
            <span>{chatTags.length ? "Etiket" : "Etiket ekle"}</span>
          </button>
        )}
      </div>
      {others.length > 0 && (
        <div className="viewers" role="status">
          <span className="viewer-stack">
            {others.slice(0, 3).map((v) => <Avatar key={v.id} name={v.name} id={v.id} size="xs" title={v.name} />)}
          </span>
          <span className="viewer-text">{viewersText}</span>
        </div>
      )}
    </div>
  );
}
