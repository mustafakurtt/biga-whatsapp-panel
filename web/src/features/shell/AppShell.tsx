// Uygulama çerçevesi: renkli L çerçeve (kenar çubuğu + üst çubuk) ve beyaz çalışma sayfası (Outlet).
// Ekranına geçilmişse her ekranda kalıcı şerit. Canlı akış, push ve bildirim tıklaması burada bağlanır.
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router";
import { useNumbers } from "../../api/queries";
import type { NumberView } from "../../api/types";
import { BrandMark, Icon, Wordmark } from "../../components/Icon";
import { confirmDialog, openMenu, showError, toast, type MenuItem } from "../../components/overlays";
import { Avatar, cx, IconButton, statusOf, TestBadge } from "../../components/ui";
import { fmtPhone, nf } from "../../lib/format";
import { disablePush, enablePush, initPush, setAppBadge, usePush } from "../../lib/push";
import { setThemePref, toggleTheme, useTheme } from "../../lib/theme";
import { useLogout, useStopImpersonation } from "../app/impersonation";
import { useLiveConnected, useLiveEvents } from "../app/live";
import { ADMIN_SECTIONS, useAdminSections, useSession } from "../app/session";
import { lastNumberId, numberPath } from "../inbox/current";
import { CommandPalette } from "../palette/CommandPalette";
import { ImpersonateDialog } from "./ImpersonateDialog";

export function AppShell() {
  const session = useSession();
  const { user, actor } = session;
  const navigate = useNavigate();
  const location = useLocation();
  const numbers = useNumbers();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);

  const adminMatch = useMatch("/yonetim/:section");
  const numberMatch = useMatch("/n/:numberId/*");
  const chatMatch = useMatch("/n/:numberId/c/:chatId");
  const view = adminMatch ? "admin" : "inbox";
  const routeNumberId = numberMatch?.params.numberId ? Number(numberMatch.params.numberId) : null;
  const currentNumberId = routeNumberId ?? lastNumberId() ?? numbers.data?.[0]?.id ?? null;
  const currentNumber = numbers.data?.find((n) => n.id === currentNumberId) ?? null;

  useLiveEvents(`${user.id}:${actor?.id ?? ""}`, user.id);

  // Push: anahtar/izin durumu; ekranına geçilmemişse var olan aboneliği bu kişiye bağla
  useEffect(() => {
    void initPush({ rebind: !actor });
  }, [user.id, actor]);

  // Bildirime tıklanınca açık uygulama sohbeti açar (src/sw.ts "open-url" gönderir)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type !== "open-url" || !data.url) return;
      const u = new URL(data.url, window.location.origin);
      navigate(`${u.pathname}${u.search}`);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [navigate]);

  // Başlık ve kurulu uygulama rozeti: okunmamış toplamı
  const totalUnread = useMemo(() => (numbers.data ?? []).reduce((s, n) => s + (n.unread || 0), 0), [numbers.data]);
  useEffect(() => {
    document.title = `${totalUnread > 0 ? `(${totalUnread}) ` : ""}Biga Panel`;
    setAppBadge(totalUnread);
  }, [totalUnread]);

  // Ctrl/Cmd+K: arama paleti
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Sayfa değişince mobil menü kapanır
  useEffect(() => setNavOpen(false), [location.pathname]);

  const section = ADMIN_SECTIONS.find((s) => s.id === adminMatch?.params.section);
  const topTitle = view === "admin" ? (section?.label ?? "Yönetim") : (currentNumber?.label ?? "Gelen kutusu");

  return (
    <div className={cx("app", session.isImpersonating && "is-impersonating")} data-view={view} data-pane={chatMatch ? "chat" : "list"} data-nav={navOpen ? "open" : "closed"}>
      {actor && <ImpersonationBanner />}
      <div className="frame">
        <aside className="sidebar" id="sidebar" aria-label="Gezinme">
          <div className="side-top">
            <Link className="brand" to="/" aria-label="Biga Panel — gelen kutusu">
              <BrandMark size={26} />
              <Wordmark />
            </Link>
            <IconButton icon="x" label="Menüyü kapat" className="nav-close" onClick={() => setNavOpen(false)} />
          </div>
          <div className="side-scroll">
            {view === "admin" ? <AdminNav /> : <NumbersNav numbers={numbers.data ?? []} currentId={currentNumberId} loading={numbers.isPending} />}
          </div>
          <SideFoot view={view} onImpersonate={() => setImpOpen(true)} />
        </aside>
        <Topbar title={topTitle} onMenu={() => setNavOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <main className="sheet" id="sheet">
          <Outlet />
        </main>
      </div>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onImpersonate={() => setImpOpen(true)} />}
      {impOpen && <ImpersonateDialog onClose={() => setImpOpen(false)} />}
    </div>
  );
}

function ImpersonationBanner() {
  const { actor, user, has } = useSession();
  const stop = useStopImpersonation();
  const [busy, setBusy] = useState(false);
  if (!actor) return null;
  return (
    <div className="imp-slot">
      <div className="imp-banner" role="status">
        <Icon name="eye" size={18} className="imp-ico" />
        <p className="imp-text">
          <strong>{actor.name}</strong> olarak <strong>{user.name}</strong> kullanıcısının ekranındasınız
          <span className="imp-mode">{has("messages.send") ? "Gönderebilir" : "İzleme modu"}</span>
        </p>
        <button
          type="button"
          className="imp-back"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await stop();
            setBusy(false);
          }}
        >
          <Icon name="swap" size={16} />
          <span>Kendi hesabıma dön</span>
        </button>
      </div>
    </div>
  );
}

function Topbar({ title, onMenu, onSearch }: { title: string; onMenu: () => void; onSearch: () => void }) {
  const live = useLiveConnected();
  const { effective } = useTheme();
  const isMac = /Mac|iP/.test(navigator.platform);
  return (
    <header className="topbar">
      <IconButton icon="menu" label="Menüyü aç" className="nav-open" aria-controls="sidebar" onClick={onMenu} />
      <span className="top-title">{title}</span>
      <button type="button" className="search-trigger" onClick={onSearch}>
        <Icon name="search" size={16} />
        <span className="search-trigger-text">Mesajlarda ara, sayfaya git</span>
        <kbd className="kbd">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <div className="top-right">
        <IconButton icon="search" label="Ara" className="search-icon-btn" onClick={onSearch} />
        <span className={cx("live", live && "on")} role="status" title={live ? "Canlı bağlantı açık: yeni mesajlar anında gelir" : "Canlı bağlantı koptu, yeniden bağlanıyor…"}>
          <span className="live-dot" />
          <span className="live-text">{live ? "Canlı" : "Bağlanıyor…"}</span>
        </span>
        <IconButton icon={effective === "dark" ? "sun" : "moon"} label={effective === "dark" ? "Açık temaya geç" : "Koyu temaya geç"} className="theme-btn" onClick={toggleTheme} />
      </div>
    </header>
  );
}

function NumbersNav({ numbers, currentId, loading }: { numbers: NumberView[]; currentId: number | null; loading: boolean }) {
  const { has } = useSession();
  const navigate = useNavigate();
  const total = numbers.reduce((s, n) => s + (n.unread || 0), 0);
  return (
    <div className="nav-group">
      <div className="nav-heading">
        <span>Numaralar</span>
        {total > 0 && <span className="nav-heading-meta">{nf.format(total)} okunmamış</span>}
      </div>
      <ul className="nav-list numbers-nav">
        {!loading && !numbers.length && (
          <li className="nav-empty">{has("numbers.manage") ? "Henüz numara yok. Yönetimden ekleyin." : "Size atanmış numara yok."}</li>
        )}
        {numbers.map((n) => {
          const st = statusOf(n.status);
          const active = n.id === currentId;
          return (
            <li key={n.id}>
              <button
                type="button"
                className={cx("nav-item number-item", active && "active")}
                aria-current={active ? "true" : undefined}
                title={`${n.label} · ${fmtPhone(n.phone)} · ${st.label}${n.access === "read" ? " · Sadece okuma" : ""}${n.provider === "mock" ? " · Test numarası" : ""}`}
                onClick={() => navigate(numberPath(n.id))}
              >
                <span className={cx("status-dot", `tone-${st.tone}`)} aria-hidden="true" />
                <span className="number-text">
                  <span className="number-label">
                    {n.label}
                    {n.provider === "mock" && <> <TestBadge /></>}
                  </span>
                  <span className="number-sub">{n.status === "WORKING" ? fmtPhone(n.phone) : st.label}</span>
                </span>
                {n.access === "read" && (
                  <span className="access-mark" title="Sadece okuma" aria-label="Sadece okuma">
                    <Icon name="eye" size={14} />
                  </span>
                )}
                {n.unread > 0 && (
                  <span className="count" aria-label={`${n.unread} okunmamış`}>
                    {n.unread > 99 ? "99+" : nf.format(n.unread)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AdminNav() {
  const sections = useAdminSections();
  return (
    <>
      <Link className="nav-item nav-back" to="/">
        <Icon name="back" size={16} />
        <span className="nav-label">Gelen kutusu</span>
      </Link>
      <div className="nav-group">
        <div className="nav-heading"><span>Yönetim</span></div>
        <ul className="nav-list">
          {sections.map((s) => (
            <li key={s.id}>
              <NavLink className={({ isActive }) => cx("nav-item", isActive && "active")} to={`/yonetim/${s.id}`}>
                <Icon name={s.icon} size={16} />
                <span className="nav-label">{s.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function SideFoot({ view, onImpersonate }: { view: "admin" | "inbox"; onImpersonate: () => void }) {
  const { user, has, isImpersonating } = useSession();
  const sections = useAdminSections();
  const stop = useStopImpersonation();
  const logout = useLogout();
  const push = usePush();
  const { pref } = useTheme();
  const first = sections[0];

  const openUserMenu = (anchor: HTMLElement) => {
    const items: MenuItem[] = [{ heading: `@${user.username}` }];
    if (isImpersonating) items.push({ label: "Kendi hesabıma dön", icon: "swap", onSelect: () => void stop() });
    else if (has("impersonate.view")) items.push({ label: "Ekranına geç…", icon: "eye", onSelect: onImpersonate });
    if (push.supported && push.serverEnabled) {
      if (isImpersonating) {
        items.push({ label: "Kendi hesabınıza dönünce bildirimleri açabilirsiniz", icon: "bell", disabled: true });
      } else if (push.permission === "denied") {
        items.push({ label: "Bildirimler tarayıcıda engelli", icon: "bell", disabled: true });
      } else {
        items.push({
          label: push.subscribed ? "Bildirimleri kapat" : "Bildirimleri aç",
          icon: "bell",
          hint: push.subscribed ? "Açık" : "Kapalı",
          onSelect: () => void togglePush(push.subscribed),
        });
      }
    }
    items.push(
      "sep",
      { heading: "Tema" },
      { label: "Sistem", selected: pref === "system", onSelect: () => setThemePref("system") },
      { label: "Açık", icon: "sun", selected: pref === "light", onSelect: () => setThemePref("light") },
      { label: "Koyu", icon: "moon", selected: pref === "dark", onSelect: () => setThemePref("dark") },
      "sep",
      { label: "Çıkış yap", icon: "logout", onSelect: () => void logout() },
    );
    openMenu(anchor, items, { width: 240 });
  };

  return (
    <div className="side-foot">
      {view !== "admin" && first && (
        <Link className="nav-item" to={`/yonetim/${first.id}`}>
          <Icon name="settings" size={16} />
          <span className="nav-label">Yönetim</span>
        </Link>
      )}
      <button type="button" className="user-btn" aria-haspopup="menu" aria-expanded="false" onClick={(e) => openUserMenu(e.currentTarget)}>
        <Avatar name={user.name} id={user.id} size="md" />
        <span className="user-text">
          <span className="user-name">{user.name}</span>
          <span className="user-role">{user.roleName}</span>
        </span>
        <Icon name="more" size={16} className="user-more" />
      </button>
    </div>
  );
}

async function togglePush(subscribed: boolean) {
  try {
    if (subscribed) {
      const ok = await confirmDialog({ title: "Bildirimler kapatılsın mı?", message: "Bu cihaza yeni mesaj bildirimi gelmez. Diğer cihazlarınız etkilenmez.", confirmText: "Kapat" });
      if (!ok) return;
      await disablePush();
      toast("Bu cihazda bildirimler kapatıldı", "ok");
    } else {
      await enablePush();
      toast("Bu cihazda bildirimler açıldı", "ok");
    }
  } catch (err) {
    showError(err);
  }
}
