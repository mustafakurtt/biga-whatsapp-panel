// Panel ön yüzü: giriş, numaralar, sohbetler, mesajlar, canlı akış, yönetim ve push.
// Kullanıcıdan/dışarıdan gelen metin her zaman textContent ile yazılır (innerHTML yok).

const $ = (id) => document.getElementById(id);

const ROLE_LABELS = { patron: "Patron", temsilci: "Temsilci", salt_okunur: "Salt okunur" };
const STATUS = {
  WORKING: ["Bağlı", "ok"],
  SCAN_QR_CODE: ["Bağlantı bekliyor", "warn"],
  STARTING: ["Başlatılıyor", "warn"],
  FAILED: ["Hata/çıkış yapıldı", "bad"],
  STOPPED: ["Durduruldu", "bad"],
};
const PAGE_SIZE = 100;

const state = {
  me: null,
  numbers: [],
  chats: [],
  numberId: null,
  chat: null,
  messages: [],
  hasMore: false,
  loadingOlder: false,
  events: null,
  everConnected: false,
};

// ---------- Yardımcılar ----------

class UnauthorizedError extends Error {}

async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new Error("Sunucuya ulaşılamadı");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.status === 401 && path !== "/api/auth/login") {
    showLogin();
    throw new UnauthorizedError((data && data.error) || "Oturum süresi doldu");
  }
  if (!res.ok) throw new Error((data && data.error) || `İstek başarısız (${res.status})`);
  return data || {};
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k in node && typeof v !== "string") node[k] = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 4000);
}

// Hata mesajını gösterir; 401 zaten girişe yönlendirdiği için sessiz geçilir.
function showError(err) {
  if (err instanceof UnauthorizedError) return;
  toast(err && err.message ? err.message : String(err));
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

function fmtFull(ts) {
  return new Date(ts).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function statusBadge(status) {
  const [label, cls] = STATUS[status] || [status || "Bilinmiyor", ""];
  return el("span", { class: `badge ${cls}`.trim(), text: label });
}

function remoteLabel(remoteId) {
  return String(remoteId || "").replace(/@.*$/, "");
}

const canWrite = () => state.me && state.me.role !== "salt_okunur";
const isPatron = () => state.me && state.me.role === "patron";

// ---------- Görünümler ----------

function showLogin() {
  state.me = null;
  closeEvents();
  $("main-view").classList.add("hidden");
  $("login-view").classList.remove("hidden");
  if ($("modal").open) $("modal").close();
}

async function showMain(user) {
  state.me = user;
  $("login-view").classList.add("hidden");
  $("main-view").classList.remove("hidden");
  $("me").textContent = `${user.name} · ${ROLE_LABELS[user.role] || user.role}`;
  $("admin-btn").classList.toggle("hidden", !isPatron());
  $("composer").classList.toggle("hidden", !canWrite());
  $("readonly-note").classList.toggle("hidden", canWrite());
  updateNewChatBtn();
  openEvents();
  setupPush().catch(() => {});
  await loadNumbers();
  await openDeepLink();
}

function updateNewChatBtn() {
  $("new-chat-btn").classList.toggle("hidden", !canWrite() || !state.numberId);
}

// ---------- Giriş / çıkış ----------

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  $("login-error").textContent = "";
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const { user } = await api("POST", "/api/auth/login", {
      username: form.username.value.trim(),
      password: form.password.value,
    });
    form.password.value = "";
    await showMain(user);
  } catch (err) {
    $("login-error").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$("logout-btn").addEventListener("click", async () => {
  try {
    await api("POST", "/api/auth/logout");
  } catch {
    // çıkışta hata önemsiz
  }
  resetState();
  showLogin();
});

function resetState() {
  Object.assign(state, { numbers: [], chats: [], numberId: null, chat: null, messages: [], hasMore: false });
  $("numbers").replaceChildren();
  $("chats").replaceChildren();
  closeChat();
}

// ---------- Numaralar ----------

async function loadNumbers() {
  try {
    const { numbers } = await api("GET", "/api/numbers");
    state.numbers = numbers || [];
  } catch (err) {
    showError(err);
    return;
  }
  if (!state.numbers.some((n) => n.id === state.numberId)) {
    state.numberId = state.numbers.length ? state.numbers[0].id : null;
  }
  renderNumbers();
  updateNewChatBtn();
  await loadChats();
}

function renderNumbers() {
  const ul = $("numbers");
  if (!state.numbers.length) {
    ul.replaceChildren(el("li", { class: "empty-item", text: "Size atanmış numara yok" }));
    return;
  }
  ul.replaceChildren(
    ...state.numbers.map((n) =>
      el(
        "li",
        { class: n.id === state.numberId ? "active" : "", onclick: () => selectNumber(n.id) },
        el(
          "div",
          { class: "grow" },
          el("div", { class: "title" }, el("strong", { text: n.label }), statusBadge(n.status)),
          el("div", { class: "sub", text: n.phone }),
        ),
      ),
    ),
  );
}

async function selectNumber(id) {
  if (state.numberId === id) return;
  state.numberId = id;
  renderNumbers();
  updateNewChatBtn();
  await loadChats();
}

// ---------- Sohbet listesi ----------

async function loadChats() {
  if (!state.numberId) {
    state.chats = [];
    renderChats();
    return;
  }
  const numberId = state.numberId;
  try {
    const { chats } = await api("GET", `/api/numbers/${numberId}/chats`);
    if (numberId !== state.numberId) return; // bu arada başka numara seçildi
    state.chats = chats || [];
  } catch (err) {
    showError(err);
    return;
  }
  renderChats();
}

function renderChats() {
  const ul = $("chats");
  if (!state.numberId) {
    ul.replaceChildren();
    return;
  }
  if (!state.chats.length) {
    ul.replaceChildren(el("li", { class: "empty-item", text: "Henüz sohbet yok" }));
    return;
  }
  ul.replaceChildren(
    ...state.chats.map((c) =>
      el(
        "li",
        { class: state.chat && state.chat.id === c.id ? "active" : "", onclick: () => openChat(c) },
        el(
          "div",
          { class: "grow" },
          el(
            "div",
            { class: "title" },
            el("strong", { class: "name", text: c.name || remoteLabel(c.remote_id) }),
            el("span", { class: "time", text: fmtTime(c.last_message_at) }),
          ),
          el("div", { class: "sub", text: c.last_text || "" }),
        ),
        c.unread > 0 ? el("span", { class: "unread", text: String(c.unread) }) : null,
      ),
    ),
  );
}

// Sohbeti listede günceller/ekler ve en üste taşır.
function upsertChat(chat) {
  state.chats = [chat, ...state.chats.filter((c) => c.id !== chat.id)];
  renderChats();
}

// ---------- Mesajlar ----------

async function openChat(chat) {
  state.chat = chat;
  state.messages = [];
  state.hasMore = false;
  $("pane-empty").classList.add("hidden");
  $("pane-chat").classList.remove("hidden");
  $("main-view").classList.add("chat-open");
  $("chat-name").textContent = chat.name || remoteLabel(chat.remote_id);
  $("chat-remote").textContent = remoteLabel(chat.remote_id);
  $("messages").replaceChildren();
  renderChats();

  try {
    const { messages } = await api("GET", `/api/chats/${chat.id}/messages`);
    if (!state.chat || state.chat.id !== chat.id) return;
    state.messages = messages || [];
    state.hasMore = state.messages.length >= PAGE_SIZE;
    renderMessages();
    scrollToBottom();
  } catch (err) {
    showError(err);
    return;
  }
  markRead(chat);
  if (canWrite()) $("composer").text.focus({ preventScroll: true });
}

function closeChat() {
  state.chat = null;
  state.messages = [];
  $("pane-chat").classList.add("hidden");
  $("pane-empty").classList.remove("hidden");
  $("main-view").classList.remove("chat-open");
}

async function markRead(chat) {
  const local = state.chats.find((c) => c.id === chat.id);
  if (local && local.unread) {
    local.unread = 0;
    renderChats();
  }
  try {
    await api("POST", `/api/chats/${chat.id}/read`);
  } catch (err) {
    showError(err);
  }
}

function bubble(m) {
  const out = m.direction === "out";
  let who = null;
  if (out) who = m.source === "phone" ? "Telefondan" : m.sent_by_name || "Panel";
  return el(
    "div",
    { class: out ? "bubble out" : "bubble", "data-id": String(m.id) },
    who ? el("div", { class: "who", text: who }) : null,
    el("div", { text: m.body || "" }),
    el("div", { class: "meta", text: fmtTime(m.ts), title: fmtFull(m.ts) }),
  );
}

function renderMessages() {
  const box = $("messages");
  const nodes = [];
  if (state.hasMore) {
    nodes.push(el("button", { class: "small older", text: "Daha eski", onclick: loadOlder }));
  }
  if (!state.messages.length) nodes.push(el("div", { class: "empty", text: "Henüz mesaj yok" }));
  nodes.push(...state.messages.map(bubble));
  box.replaceChildren(...nodes);
}

function scrollToBottom() {
  const box = $("messages");
  box.scrollTop = box.scrollHeight;
}

async function loadOlder() {
  if (!state.chat || !state.hasMore || state.loadingOlder || !state.messages.length) return;
  state.loadingOlder = true;
  const chatId = state.chat.id;
  const box = $("messages");
  const prevHeight = box.scrollHeight;
  try {
    const before = state.messages[0].ts;
    const { messages } = await api("GET", `/api/chats/${chatId}/messages?before=${encodeURIComponent(before)}`);
    if (!state.chat || state.chat.id !== chatId) return;
    const known = new Set(state.messages.map((m) => m.id));
    const older = (messages || []).filter((m) => !known.has(m.id));
    state.messages = [...older, ...state.messages];
    state.hasMore = (messages || []).length >= PAGE_SIZE;
    renderMessages();
    box.scrollTop = box.scrollHeight - prevHeight; // okuma konumunu koru
  } catch (err) {
    showError(err);
  } finally {
    state.loadingOlder = false;
  }
}

$("messages").addEventListener("scroll", (e) => {
  if (e.currentTarget.scrollTop < 40) loadOlder();
});

function appendMessage(m) {
  if (state.messages.some((x) => x.id === m.id)) return;
  const box = $("messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  state.messages.push(m);
  if (state.messages.length === 1) renderMessages();
  else box.append(bubble(m));
  if (nearBottom || m.direction === "out") scrollToBottom();
}

$("back-btn").addEventListener("click", () => {
  closeChat();
  renderChats();
});

// ---------- Mesaj gönderme ----------

const composer = $("composer");

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.chat || !canWrite()) return;
  const area = composer.text;
  const text = area.value.trim();
  if (!text) return;
  const btn = composer.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await api("POST", `/api/chats/${state.chat.id}/messages`, { text });
    area.value = "";
    autoGrow();
    // Mesajın kendisi canlı akıştan ("message" olayı) gelir.
  } catch (err) {
    showError(err);
  } finally {
    btn.disabled = false;
    area.focus();
  }
});

composer.text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

function autoGrow() {
  const area = composer.text;
  area.style.height = "auto";
  area.style.height = `${Math.min(area.scrollHeight, 140)}px`;
}
composer.text.addEventListener("input", autoGrow);

// ---------- Yeni sohbet ----------

$("new-chat-btn").addEventListener("click", () => {
  if (!state.numberId || !canWrite()) return;
  const number = state.numbers.find((n) => n.id === state.numberId);
  const err = el("p", { class: "error" });
  const form = el(
    "form",
    {},
    el("label", {}, "Telefon numarası (ülke koduyla, örn. 905551234567)",
      el("input", { name: "phone", inputmode: "tel", required: true, autocomplete: "off" })),
    el("label", {}, "İlk mesaj", el("textarea", { name: "text", rows: 3, required: true })),
    err,
    el("div", { class: "row" },
      el("button", { type: "button", text: "Vazgeç", onclick: () => $("modal").close() }),
      el("button", { type: "submit", class: "primary", text: "Gönder" })),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const { chat } = await api("POST", `/api/numbers/${state.numberId}/chats`, {
        phone: form.phone.value.trim(),
        text: form.text.value.trim(),
      });
      $("modal").close();
      if (chat) {
        if (chat.number_id === state.numberId) upsertChat(chat);
        openChat(chat);
      }
    } catch (ex) {
      if (!(ex instanceof UnauthorizedError)) err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
  openModal(
    el("div", { class: "modal-head" },
      el("h3", { text: `Yeni sohbet${number ? " · " + number.label : ""}` }),
      el("button", { class: "small", text: "Kapat", onclick: () => $("modal").close() })),
    form,
  );
  form.phone.focus();
});

function openModal(...children) {
  $("modal-body").replaceChildren(...children);
  if (!$("modal").open) $("modal").showModal();
}

// ---------- Canlı akış (SSE) ----------

function setLive(on) {
  const l = $("live");
  l.classList.toggle("on", on);
  l.title = on ? "Canlı bağlantı: açık" : "Canlı bağlantı: kopuk, yeniden bağlanıyor";
}

function openEvents() {
  closeEvents();
  state.everConnected = false;
  const es = new EventSource("/api/events");
  state.events = es;
  es.onopen = () => {
    setLive(true);
    // Yeniden bağlanınca kaçırılan olaylar için listeleri tazele.
    if (state.everConnected) refreshAfterReconnect();
    state.everConnected = true;
  };
  es.onerror = () => {
    setLive(false);
    // Sunucu oturumu reddederse (401) EventSource kapanır; oturumu kontrol et.
    if (es.readyState === EventSource.CLOSED) {
      setTimeout(async () => {
        if (state.events !== es) return;
        try {
          await api("GET", "/api/auth/me");
          openEvents();
        } catch {
          // 401 ise api() girişe yönlendirdi
        }
      }, 3000);
    }
  };
  es.onmessage = (e) => {
    let ev;
    try {
      ev = JSON.parse(e.data);
    } catch {
      return;
    }
    handleEvent(ev);
  };
}

function closeEvents() {
  if (state.events) {
    state.events.close();
    state.events = null;
  }
  setLive(false);
}

async function refreshAfterReconnect() {
  await loadNumbers();
  if (state.chat) {
    const chatId = state.chat.id;
    try {
      const { messages } = await api("GET", `/api/chats/${chatId}/messages`);
      if (!state.chat || state.chat.id !== chatId) return;
      for (const m of messages || []) appendMessage(m);
    } catch (err) {
      showError(err);
    }
  }
}

function handleEvent(ev) {
  if (ev.type === "message") {
    const { chat, message } = ev;
    const isOpen = state.chat && state.chat.id === chat.id;
    if (isOpen) {
      state.chat = chat;
      appendMessage(message);
      if (message.direction === "in") markRead(chat);
    }
    if (ev.numberId === state.numberId) upsertChat(isOpen ? { ...chat, unread: 0 } : chat);
  } else if (ev.type === "number_status") {
    const n = state.numbers.find((x) => x.id === ev.numberId);
    if (n) {
      n.status = ev.status;
      renderNumbers();
    }
    if (adminState.open && adminState.tab === "numbers") renderAdmin();
  }
}

// ---------- Derin bağlantı (?chat=<id>) ----------

async function openDeepLink() {
  const params = new URLSearchParams(location.search);
  const chatId = Number(params.get("chat"));
  if (!chatId) return;
  history.replaceState(null, "", location.pathname);
  const chat = await findChat(chatId);
  if (chat) openChat(chat);
  else toast("Sohbet bulunamadı veya erişim yetkiniz yok");
}

// Sohbeti sunucudan alır ve ait olduğu numarayı seçer.
async function findChat(chatId) {
  const local = state.chats.find((c) => c.id === chatId);
  if (local) return local;
  try {
    const { chat } = await api("GET", `/api/chats/${chatId}`);
    if (chat.number_id !== state.numberId) {
      const { chats } = await api("GET", `/api/numbers/${chat.number_id}/chats`);
      state.numberId = chat.number_id;
      state.chats = chats || [];
      renderNumbers();
      updateNewChatBtn();
    }
    return state.chats.find((c) => c.id === chatId) || chat;
  } catch {
    return null;
  }
}

// Uygulama açıkken bildirime tıklanırsa service worker mesaj gönderir.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", async (e) => {
    if (!e.data || e.data.type !== "open-url" || !state.me) return;
    const url = new URL(e.data.url, location.origin);
    const chatId = Number(url.searchParams.get("chat"));
    if (!chatId) return;
    const chat = await findChat(chatId);
    if (chat) openChat(chat);
  });
}

// ---------- Yönetim (patron) ----------

const adminState = { open: false, tab: "numbers", users: [], pair: {}, qr: {} };

$("admin-btn").addEventListener("click", async () => {
  if (!isPatron()) return;
  adminState.open = true;
  adminState.pair = {};
  adminState.qr = {};
  await loadNumbers();
  renderAdmin();
  if (!$("modal").open) $("modal").showModal();
});

$("modal").addEventListener("close", () => {
  adminState.open = false;
});

async function switchTab(tab) {
  adminState.tab = tab;
  if (tab === "users") await loadUsers();
  renderAdmin();
}

function renderAdmin() {
  if (!adminState.open) return;
  const tabs = el("div", { class: "tabs" },
    el("button", { class: adminState.tab === "numbers" ? "active" : "", text: "Numaralar", onclick: () => switchTab("numbers") }),
    el("button", { class: adminState.tab === "users" ? "active" : "", text: "Kullanıcılar", onclick: () => switchTab("users") }));
  const head = el("div", { class: "modal-head" },
    el("h3", { text: "Yönetim" }),
    el("button", { class: "small", text: "Kapat", onclick: () => $("modal").close() }));
  const body = adminState.tab === "numbers" ? adminNumbers() : adminUsers();
  $("modal-body").replaceChildren(head, tabs, body);
}

// Bir yönetim işlemini çalıştırır; hata olursa toast gösterir.
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    showError(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function adminNumbers() {
  const form = el("form", { class: "row" },
    el("label", {}, "Etiket", el("input", { name: "label", required: true, placeholder: "Satış" })),
    el("label", {}, "Telefon", el("input", { name: "phone", required: true, inputmode: "tel", placeholder: "905551234567" })),
    el("button", { type: "submit", class: "primary", text: "Numara ekle" }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(form.querySelector("button"), async () => {
      await api("POST", "/api/numbers", {
        label: form.label.value.trim(),
        phone: form.phone.value.trim(),
      });
      toast("Numara eklendi. Şimdi eşleştirme kodu alın.");
      await loadNumbers();
      renderAdmin();
    });
  });

  const items = state.numbers.map((n) => {
    const pairBtn = el("button", { class: "small", text: "Eşleştirme kodu al" });
    pairBtn.addEventListener("click", () => run(pairBtn, async () => {
      const { code } = await api("POST", `/api/numbers/${n.id}/pair`);
      adminState.pair[n.id] = code;
      renderAdmin();
    }));
    const qrBtn = el("button", { class: "small", text: adminState.qr[n.id] ? "QR gizle" : "QR göster" });
    qrBtn.addEventListener("click", () => {
      adminState.qr[n.id] = adminState.qr[n.id] ? null : Date.now();
      renderAdmin();
    });
    const refreshBtn = el("button", { class: "small", text: "Durumu yenile" });
    refreshBtn.addEventListener("click", () => run(refreshBtn, async () => {
      const { number } = await api("POST", `/api/numbers/${n.id}/refresh`);
      if (number) {
        const local = state.numbers.find((x) => x.id === n.id);
        if (local) Object.assign(local, number);
        renderNumbers();
      }
      if (adminState.qr[n.id]) adminState.qr[n.id] = Date.now();
      renderAdmin();
    }));
    const delBtn = el("button", { class: "small danger", text: "Sil" });
    delBtn.addEventListener("click", () => {
      if (!confirm(`"${n.label}" (${n.phone}) numarası silinsin mi?`)) return;
      run(delBtn, async () => {
        await api("DELETE", `/api/numbers/${n.id}`);
        delete adminState.pair[n.id];
        delete adminState.qr[n.id];
        if (state.chat && state.chat.number_id === n.id) closeChat();
        await loadNumbers();
        renderAdmin();
      });
    });

    const code = adminState.pair[n.id];
    const pairBox = code
      ? el("div", {},
          el("div", { class: "code", text: code }),
          el("p", { class: "hint", text: "Telefonda WhatsApp → Bağlı cihazlar → Cihaz bağla → Bunun yerine telefon numarasıyla bağlan → kodu girin." }))
      : null;
    const qrBox = adminState.qr[n.id]
      ? el("div", {},
          el("img", { class: "qr", alt: "QR kodu", src: `/api/numbers/${n.id}/qr?t=${adminState.qr[n.id]}`,
            onerror: (e) => { e.currentTarget.replaceWith(el("p", { class: "error", text: "QR alınamadı (numara zaten bağlı olabilir)." })); } }),
          el("p", { class: "hint", text: "Telefonda WhatsApp → Bağlı cihazlar → Cihaz bağla → QR kodunu okutun." }))
      : null;

    return el("div", { class: "item" },
      el("div", { class: "title-row" },
        el("strong", { text: n.label }), el("span", { class: "sub", text: n.phone }), statusBadge(n.status)),
      el("div", { class: "actions" }, pairBtn, qrBtn, refreshBtn, delBtn),
      pairBox, qrBox);
  });

  return el("div", {},
    form,
    items.length ? items : el("p", { class: "hint", text: "Henüz numara yok." }));
}

async function loadUsers() {
  try {
    const { users } = await api("GET", "/api/users");
    adminState.users = users || [];
  } catch (err) {
    showError(err);
  }
}

function roleSelect(value) {
  return el("select", { name: "role" },
    ...Object.entries(ROLE_LABELS).map(([v, label]) =>
      el("option", { value: v, text: label, selected: v === value })));
}

function numberChecks(selected = []) {
  if (!state.numbers.length) return el("p", { class: "hint", text: "Atanacak numara yok." });
  return el("div", { class: "checks" },
    ...state.numbers.map((n) =>
      el("label", {},
        el("input", { type: "checkbox", name: "numberIds", value: String(n.id), checked: selected.includes(n.id) }),
        `${n.label} (${n.phone})`)));
}

const checkedIds = (form) =>
  [...form.querySelectorAll("input[name=numberIds]:checked")].map((i) => Number(i.value));

function adminUsers() {
  const form = el("form", { class: "item" },
    el("strong", { text: "Yeni kullanıcı" }),
    el("div", { class: "row" },
      el("label", {}, "Kullanıcı adı", el("input", { name: "username", required: true, autocomplete: "off" })),
      el("label", {}, "Ad soyad", el("input", { name: "name", required: true })),
      el("label", {}, "Şifre", el("input", { name: "password", type: "password", required: true, autocomplete: "new-password" })),
      el("label", {}, "Rol", roleSelect("temsilci"))),
    el("label", {}, "Numaralar (patron hepsini görür)"),
    numberChecks(),
    el("div", { class: "actions" }, el("button", { type: "submit", class: "primary", text: "Kullanıcı ekle" })));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(form.querySelector("button[type=submit]"), async () => {
      await api("POST", "/api/users", {
        username: form.username.value.trim(),
        name: form.name.value.trim(),
        password: form.password.value,
        role: form.role.value,
        numberIds: checkedIds(form),
      });
      toast("Kullanıcı eklendi");
      await loadUsers();
      renderAdmin();
    });
  });

  const items = adminState.users.map((u) => {
    const names = u.role === "patron"
      ? "Tüm numaralar"
      : state.numbers.filter((n) => (u.numberIds || []).includes(n.id)).map((n) => n.label).join(", ") || "Numara atanmamış";
    const editBtn = el("button", { class: "small", text: "Düzenle" });
    const delBtn = el("button", { class: "small danger", text: "Sil" });
    const item = el("div", { class: "item" },
      el("div", { class: "title-row" },
        el("strong", { text: u.name }), el("span", { class: "sub", text: `@${u.username}` }),
        el("span", { class: "badge", text: ROLE_LABELS[u.role] || u.role })),
      el("div", { class: "sub", text: names }),
      el("div", { class: "actions" }, editBtn, delBtn));

    editBtn.addEventListener("click", () => item.replaceWith(userEditForm(u)));
    delBtn.addEventListener("click", () => {
      if (!confirm(`"${u.name}" kullanıcısı silinsin mi?`)) return;
      run(delBtn, async () => {
        await api("DELETE", `/api/users/${u.id}`);
        await loadUsers();
        renderAdmin();
      });
    });
    return item;
  });

  return el("div", {}, form, ...items);
}

function userEditForm(u) {
  const form = el("form", { class: "item" },
    el("strong", { text: `Düzenle: @${u.username}` }),
    el("div", { class: "row" },
      el("label", {}, "Ad soyad", el("input", { name: "name", required: true, value: u.name })),
      el("label", {}, "Yeni şifre (boş bırakılırsa değişmez)",
        el("input", { name: "password", type: "password", autocomplete: "new-password" })),
      el("label", {}, "Rol", roleSelect(u.role))),
    el("label", {}, "Numaralar"),
    numberChecks(u.numberIds || []),
    el("div", { class: "actions" },
      el("button", { type: "submit", class: "primary", text: "Kaydet" }),
      el("button", { type: "button", text: "Vazgeç", onclick: () => renderAdmin() })));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(form.querySelector("button[type=submit]"), async () => {
      const body = { name: form.name.value.trim(), role: form.role.value, numberIds: checkedIds(form) };
      if (form.password.value) body.password = form.password.value;
      await api("PUT", `/api/users/${u.id}`, body);
      toast("Kullanıcı güncellendi");
      if (u.id === state.me.id) {
        const { user } = await api("GET", "/api/auth/me");
        state.me = user;
        $("me").textContent = `${user.name} · ${ROLE_LABELS[user.role] || user.role}`;
      }
      await loadUsers();
      renderAdmin();
    });
  });
  return form;
}

// ---------- Push bildirimleri ----------

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
let pushKey = "";

async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function setupPush() {
  const btn = $("push-btn");
  btn.classList.add("hidden");
  if (!pushSupported()) return;
  const { publicKey } = await api("GET", "/api/push/key");
  pushKey = publicKey || "";
  if (!pushKey) return;
  if (!(await registerSW())) return;
  btn.classList.remove("hidden");
  await updatePushBtn();
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function updatePushBtn() {
  const sub = await currentSubscription();
  $("push-btn").textContent = sub ? "Bildirimler açık" : "Bildirimleri aç";
  $("push-btn").title = sub ? "Kapatmak için tıklayın" : "";
}

$("push-btn").addEventListener("click", (e) => run(e.currentTarget, async () => {
  const existing = await currentSubscription();
  if (existing) {
    if (!confirm("Bu cihazda bildirimler kapatılsın mı?")) return;
    await api("POST", "/api/push/unsubscribe", { endpoint: existing.endpoint });
    await existing.unsubscribe();
    toast("Bildirimler kapatıldı");
  } else {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("Bildirim izni verilmedi");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pushKey),
    });
    await api("POST", "/api/push/subscribe", sub.toJSON());
    toast("Bildirimler açıldı");
  }
  await updatePushBtn();
}));

// ---------- Başlangıç ----------

async function init() {
  registerSW(); // PWA kurulumu için her durumda
  try {
    const { user } = await api("GET", "/api/auth/me");
    await showMain(user);
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      showLogin();
      $("login-error").textContent = err.message;
    }
  }
}

init();
