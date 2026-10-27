// Gerçek WhatsApp: her numara Baileys ile sunucuya "bağlı cihaz" olarak eklenir (pairing code ya da QR).
// Oturum dosyaları BAILEYS_AUTH_DIR/<oturum> klasöründe durur; sunucu yeniden başlayınca oradan bağlanır.
import makeWASocket, {
  Browsers,
  DisconnectReason,
  isJidBroadcast,
  isJidGroup,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WAMessageStatus,
  type Contact,
  type WAMessage,
  type WAMessageContent,
  type WASocket,
} from "baileys";
import type { Logger } from "@mustafakurtt/hono-core/logger";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import type { Env } from "../config/env";
import { type InboundHandler, type InboundMessage, type MessagingProvider, ProviderError } from "../shared/contracts";
import type { NumberStatus } from "../shared/types";
import { textOf, timestampMs } from "./baileys.messages";
import { silenceLibsignalSessionLogs } from "./libsignal-quiet";

const READY_TIMEOUT_MS = 20_000;
const MAX_RETRY_DELAY_MS = 60_000;
// Doğal gönderim hızı: aynı numaradan iki gönderim arası en az 3–5 sn, gönderim öncesi kısa "yazıyor…".
const MIN_SEND_GAP_MS = 3_000;
const SEND_JITTER_MS = 2_000;
const TYPING_MS = 800;
// Bağlantı koparsa en fazla bu kadar yeniden deneme; sonra elle müdahale beklenir (sonsuz döngü bot gibi görünür).
const MAX_RETRIES = 10;
// 463 (WhatsApp kısıtlaması) gelince gönderim bu süre boyunca durdurulur.
const RESTRICTION_PAUSE_MS = 24 * 60 * 60 * 1000;
// Karşı taraf mesajı çözemezse yeniden gönderebilmek için son gönderilenler bellekte tutulur.
const SENT_CACHE_SIZE = 500;
const QUEUE_DROPPED =
  "Mesaj sırada beklerken numara kısıtlandı ya da bağlantı koptu; gönderilmedi. Numaranın durumunu kontrol edin.";
// Bağlantı bu kadar süre açık kalırsa "sağlam" sayılır ve yeniden deneme sayacı sıfırlanır.
const STABLE_CONNECTION_MS = 60_000;
// Geçmiş parçaları arasında bu kadar sessizlik olunca biriken parçalar işlenir.
const HISTORY_SETTLE_MS = 4_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Entry {
  sock: WASocket;
  qr: string | null;
  closing: boolean; // bilerek kapatılıyor: yeniden bağlanma
  ready: Promise<void>; // ilk QR ya da bağlantı açılınca çözülür
}

const statusCodeOf = (err: unknown): number | undefined =>
  (err as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;

const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new ProviderError(message)), ms)),
  ]);

export const createBaileysProvider = (opts: { env: Env; logger: Logger; onEvent: InboundHandler }): MessagingProvider => {
  silenceLibsignalSessionLogs();
  const { env, onEvent } = opts;
  const logger = opts.logger.child({ module: "baileys" });
  // Baileys çok konuşkan; kendi kayıtlarını sadece uyarı seviyesinden itibaren yazar.
  const libLogger = opts.logger.child({ module: "baileys-lib" }, { level: "warn" });

  const entries = new Map<string, Entry>();
  const starting = new Map<string, Promise<Entry>>();
  const known = new Map<string, { status: NumberStatus; meId: string | null }>();
  const retries = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const sendQueues = new Map<string, Promise<void>>();
  const lastSentAt = new Map<string, number>();
  const restrictedUntil = new Map<string, number>();
  const sentCache = new Map<string, WAMessageContent>();

  const rememberSent = (id: string | null | undefined, content: WAMessageContent | null | undefined) => {
    if (!id || !content) return;
    sentCache.set(id, content);
    if (sentCache.size > SENT_CACHE_SIZE) sentCache.delete(sentCache.keys().next().value!);
  };

  const dirOf = (session: string) => join(env.BAILEYS_AUTH_DIR, session);
  const hasCreds = (session: string) => existsSync(join(dirOf(session), "creds.json"));
  // Kısıtlama süresi oturum klasöründe saklanır: sunucu yeniden başlasa da 24 saatlik duraklama sürer.
  const restrictionFile = (session: string) => join(dirOf(session), "panel-restricted.json");
  const saveRestriction = (session: string, until: number | null) => {
    try {
      if (until === null) rmSync(restrictionFile(session), { force: true });
      else writeFileSync(restrictionFile(session), JSON.stringify({ until }));
    } catch (err) {
      logger.warn({ err, session }, "kısıtlama bilgisi yazılamadı");
    }
  };
  const loadRestriction = (session: string) => {
    try {
      const { until } = JSON.parse(readFileSync(restrictionFile(session), "utf8")) as { until?: unknown };
      if (typeof until === "number" && until > Date.now()) restrictedUntil.set(session, until);
      else saveRestriction(session, null);
    } catch {
      // dosya yok: kısıtlama yok
    }
  };

  const setStatus = (session: string, status: NumberStatus, meId: string | null = null) => {
    const prev = known.get(session);
    const next = { status, meId: meId ?? prev?.meId ?? null };
    known.set(session, next);
    if (prev?.status !== status || prev?.meId !== next.meId) onEvent({ kind: "status", session, ...next });
  };

  // LID (gizli kimlik) gelirse mümkünse telefon numaralı kimliğe çevrilir, böylece sohbetler numarayla eşleşir.
  const resolveRemote = async (sock: WASocket, m: WAMessage): Promise<string | null> => {
    let remote = m.key.remoteJid;
    if (!remote) return null;
    if (isJidGroup(remote) || isJidBroadcast(remote) || remote.endsWith("@newsletter")) return null;
    if (isLidUser(remote)) {
      const alt = m.key.remoteJidAlt;
      if (alt && isPnUser(alt)) remote = alt;
      else remote = (await sock.signalRepository.lidMapping.getPNForLID(remote).catch(() => null)) ?? remote;
    }
    return jidNormalizedUser(remote);
  };

  // Baileys mesajını panel mesajına çevirir; gösterilecek bir şey yoksa ya da grup/kanal ise null.
  const toInbound = async (sock: WASocket, m: WAMessage): Promise<InboundMessage | null> => {
    if (!m.key.id || !m.message) return null;
    const body = textOf(m.message);
    if (body === null) return null;
    const remoteId = await resolveRemote(sock, m);
    if (!remoteId) return null;
    const fromMe = Boolean(m.key.fromMe);
    return {
      providerId: m.key.id,
      remoteId,
      contactName: fromMe ? null : m.pushName || null,
      // Panelden gönderilenler burada görünmez (emitOwnEvents kapalı); bizden çıkan her şey telefondandır.
      source: fromMe ? "phone" : "contact",
      body,
      ts: timestampMs(m.messageTimestamp),
    };
  };

  const handleMessage = async (session: string, sock: WASocket, m: WAMessage) => {
    const message = await toInbound(sock, m);
    if (message) onEvent({ kind: "message", session, ...message });
  };

  // Rehber kaydı → sohbet kimliği (telefon numaralı). Grup, kanal ve çözülemeyen kimlikler atlanır.
  const contactRemote = async (sock: WASocket, c: Partial<Contact>): Promise<string | null> => {
    const id = c.id;
    if (!id || isJidGroup(id) || isJidBroadcast(id) || id.endsWith("@newsletter")) return null;
    if (isPnUser(id)) return jidNormalizedUser(id);
    if (c.phoneNumber && isPnUser(c.phoneNumber)) return jidNormalizedUser(c.phoneNumber);
    if (isLidUser(id)) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(id).catch(() => null);
      return jidNormalizedUser(pn ?? id);
    }
    return null;
  };

  // Sadece rehberdeki ad (name) alınır; kişinin kendi profil adı (notify) mesajla birlikte gelir.
  const handleContacts = async (session: string, sock: WASocket, list: Partial<Contact>[]) => {
    const contacts: { remoteId: string; name: string }[] = [];
    for (const c of list) {
      if (!c.name) continue;
      const remoteId = await contactRemote(sock, c);
      if (remoteId) contacts.push({ remoteId, name: c.name });
    }
    if (contacts.length > 0) onEvent({ kind: "contacts", session, contacts });
  };

  const handleHistory = async (session: string, sock: WASocket, list: WAMessage[]) => {
    const messages: InboundMessage[] = [];
    for (const m of list) {
      const message = await toInbound(sock, m);
      if (message) messages.push(message);
    }
    if (messages.length > 0) onEvent({ kind: "history", session, messages });
  };

  // Kısıtlama süresi dolduysa kaldırır (ve durumu WORKING'e döndürür).
  const isRestricted = (session: string) => {
    const until = restrictedUntil.get(session);
    if (until === undefined) return false;
    if (until > Date.now()) return true;
    restrictedUntil.delete(session);
    saveRestriction(session, null);
    if (known.get(session)?.status === "RESTRICTED" && entries.has(session)) setStatus(session, "WORKING");
    return false;
  };

  const scheduleReconnect = (session: string) => {
    const attempt = (retries.get(session) ?? 0) + 1;
    retries.set(session, attempt);
    if (attempt > MAX_RETRIES) {
      logger.error({ session }, "yeniden bağlanma denemeleri bitti; 'Durumu yenile' ya da yeniden eşleştirme gerekli");
      retries.delete(session);
      setStatus(session, "STOPPED");
      return;
    }
    const delay = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
    logger.info({ session, attempt, delay }, "yeniden bağlanılacak");
    timers.set(
      session,
      setTimeout(() => {
        timers.delete(session);
        start(session).catch((err) => logger.error({ err, session }, "yeniden bağlanılamadı"));
      }, delay),
    );
  };

  const open = async (session: string): Promise<Entry> => {
    loadRestriction(session);
    const { state, saveCreds } = await useMultiFileAuthState(dirOf(session));
    const sock = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, libLogger) },
      logger: libLogger,
      browser: Browsers.ubuntu("Chrome"),
      // Panelden gönderilen mesajlar zaten kaydediliyor; ikinci kez olay olarak gelmesin.
      emitOwnEvents: false,
      markOnlineOnConnect: false,
      // Tam geçmiş istenmez. shouldSyncHistoryMessage Baileys varsayılanında kalır: ilk eşleştirmede
      // yalnızca son sohbetler gelir (FULL hariç). Eşitlemeyi tamamen kapatmak Baileys'in LID eşlemelerini
      // almasını engeller ve oturum hatalarına yol açar (Baileys açılışta bunun için uyarı verir).
      // Panel gelen paketten sohbet başına son birkaç mesajı sessizce kaydeder (MessageService).
      syncFullHistory: false,
      getMessage: async (key) => (key.id ? sentCache.get(key.id) : undefined),
    });

    let markReady!: () => void;
    let failReady!: (err: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve;
      failReady = reject;
    });
    ready.catch(() => {}); // kimse beklemiyorsa işlenmemiş hata sayılmasın
    const entry: Entry = { sock, qr: null, closing: false, ready };

    sock.ev.on("creds.update", saveCreds);

    let stableTimer: ReturnType<typeof setTimeout> | undefined;
    sock.ev.on("connection.update", (update) => {
      if (update.qr) {
        entry.qr = update.qr;
        setStatus(session, "SCAN_QR_CODE");
        markReady();
      }
      if (update.connection === "connecting" && state.creds.registered) setStatus(session, "STARTING");
      if (update.connection === "open") {
        entry.qr = null;
        // Deneme sayacı ancak bağlantı bir süre ayakta kalınca sıfırlanır. Hemen sıfırlansaydı açılıp
        // kapanan bir bağlantı sınırsız ve ~2 sn arayla yeniden bağlanırdı.
        clearTimeout(stableTimer);
        stableTimer = setTimeout(() => retries.delete(session), STABLE_CONNECTION_MS);
        const meId = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
        setStatus(session, isRestricted(session) ? "RESTRICTED" : "WORKING", meId);
        logger.info({ session }, "WhatsApp bağlandı");
        markReady();
      }
      if (update.connection === "close") {
        clearTimeout(stableTimer);
        if (entries.get(session) === entry) entries.delete(session);
        failReady(new ProviderError("WhatsApp bağlantısı kapandı, tekrar deneyin"));
        if (entry.closing) return;
        const code = statusCodeOf(update.lastDisconnect?.error);
        logger.info({ session, code }, "WhatsApp bağlantısı kapandı");

        if (code === DisconnectReason.loggedOut) {
          // Telefondan "Bağlı cihazlar"dan çıkarıldı: eski oturum işe yaramaz, yeniden eşleştirme gerekir.
          void rm(dirOf(session), { recursive: true, force: true });
          setStatus(session, "FAILED");
          return;
        }
        if (code === DisconnectReason.connectionReplaced) {
          // Aynı oturum başka bir yerde açıldı (ör. ikinci bir sunucu). Yeniden bağlanmak ikisini birbirine düşürür.
          logger.error({ session }, "oturum başka bir yerde açıldı; yeniden bağlanılmıyor");
          setStatus(session, "STOPPED");
          return;
        }
        if (code === DisconnectReason.forbidden) {
          // Hesap ya da cihaz WhatsApp tarafından engellendi: üstüne gitmek durumu kötüleştirir.
          logger.error({ session }, "WhatsApp bağlantıyı reddetti (403); yeniden bağlanılmıyor");
          setStatus(session, "FAILED");
          return;
        }
        if (code === DisconnectReason.restartRequired) {
          // Eşleştirme kodu girildikten sonra WhatsApp yeniden başlatma ister.
          start(session).catch((err) => logger.error({ err, session }, "yeniden başlatılamadı"));
          return;
        }
        if (!state.creds.registered) {
          // Eşleştirme süresi doldu; kullanıcı yeni kod isteyince tekrar açılır.
          setStatus(session, "STOPPED");
          return;
        }
        setStatus(session, "STARTING");
        scheduleReconnect(session);
      }
    });

    // Gönderilen mesaj iletilemezse WhatsApp hata bildirir. 463 = hesap kısıtlandı: gönderimi durdur.
    sock.ev.on("messages.update", (updates) => {
      for (const { key, update } of updates) {
        if (update.status !== WAMessageStatus.ERROR || !key.fromMe) continue;
        const code = String(update.messageStubParameters?.[0] ?? "");
        logger.warn({ session, code, id: key.id }, "mesaj iletilemedi");
        if (code === "463") {
          restrictedUntil.set(session, Date.now() + RESTRICTION_PAUSE_MS);
          saveRestriction(session, restrictedUntil.get(session)!);
          logger.error({ session }, "WhatsApp hesabı kısıtladı (463); panelden gönderim 24 saat durduruldu");
          setStatus(session, "RESTRICTED");
        }
      }
    });

    sock.ev.on("messages.upsert", ({ messages }) => {
      for (const m of messages) {
        handleMessage(session, sock, m).catch((err) => logger.error({ err, session }, "mesaj işlenemedi"));
      }
    });

    // İlk eşleştirmede gelen son sohbetler ve rehber adları.
    // Geçmiş birkaç parça halinde, saniyeler içinde gelir. Parçalar biriktirilip tek seferde işlenir;
    // böylece "sohbet başına son N mesaj" tüm geçmişe uygulanır. Rehber adları hemen işlenir.
    let historyBuffer: WAMessage[] = [];
    let historyTimer: ReturnType<typeof setTimeout> | undefined;
    sock.ev.on("messaging-history.set", ({ messages, contacts, syncType }) => {
      logger.info({ session, syncType, messages: messages.length, contacts: contacts.length }, "geçmiş eşitlemesi geldi");
      handleContacts(session, sock, contacts).catch((err) => logger.error({ err, session }, "rehber işlenemedi"));
      historyBuffer.push(...messages);
      clearTimeout(historyTimer);
      historyTimer = setTimeout(() => {
        const batch = historyBuffer;
        historyBuffer = [];
        handleHistory(session, sock, batch).catch((err) => logger.error({ err, session }, "geçmiş işlenemedi"));
      }, HISTORY_SETTLE_MS);
    });
    sock.ev.on("contacts.upsert", (contacts) => {
      handleContacts(session, sock, contacts).catch((err) => logger.error({ err, session }, "rehber işlenemedi"));
    });
    sock.ev.on("contacts.update", (contacts) => {
      handleContacts(session, sock, contacts).catch((err) => logger.error({ err, session }, "rehber işlenemedi"));
    });

    return entry;
  };

  // Aynı oturum için tek soket: eşzamanlı çağrılar aynı açılışı bekler.
  const start = (session: string): Promise<Entry> => {
    const existing = entries.get(session);
    if (existing) return Promise.resolve(existing);
    const pending = starting.get(session);
    if (pending) return pending;
    const timer = timers.get(session);
    if (timer) {
      clearTimeout(timer);
      timers.delete(session);
    }
    const promise = open(session)
      .then((entry) => {
        entries.set(session, entry);
        return entry;
      })
      .finally(() => starting.delete(session));
    starting.set(session, promise);
    return promise;
  };

  const close = (session: string) => {
    const timer = timers.get(session);
    if (timer) clearTimeout(timer);
    timers.delete(session);
    retries.delete(session);
    const entry = entries.get(session);
    entries.delete(session);
    return entry;
  };

  // Eşleştirme için: soket açık ve WhatsApp'a bağlanmış (ilk QR gelmiş) olmalı.
  const startForPairing = async (session: string): Promise<Entry> => {
    const entry = await start(session);
    if (entry.sock.authState.creds.registered) throw new ProviderError("Bu numara zaten bağlı");
    await withTimeout(entry.ready, READY_TIMEOUT_MS, "WhatsApp'a bağlanılamadı, tekrar deneyin");
    return entry;
  };

  return {
    async resume(sessions) {
      for (const session of sessions) {
        if (!hasCreds(session)) continue;
        await start(session).catch((err) => logger.error({ err, session }, "oturum açılamadı"));
      }
    },

    async createSession(session) {
      await start(session);
    },

    async requestPairingCode(session, phone) {
      const entry = await startForPairing(session);
      try {
        return await entry.sock.requestPairingCode(phone);
      } catch (err) {
        logger.warn({ err, session }, "eşleştirme kodu alınamadı");
        throw new ProviderError("Eşleştirme kodu alınamadı, tekrar deneyin");
      }
    },

    async getQr(session) {
      const entry = await startForPairing(session);
      if (!entry.qr) return null;
      return new Uint8Array(await QRCode.toBuffer(entry.qr, { type: "png", width: 320, margin: 2 }));
    },

    async getStatus(session) {
      const status = known.get(session);
      if (status) return status;
      return { status: entries.has(session) ? "STARTING" : "STOPPED", meId: null };
    },

    async sendText(session, chatId, text) {
      const entry = entries.get(session);
      if (isRestricted(session)) {
        throw new ProviderError(
          "WhatsApp bu numaraya kısıtlama uyguladı; panelden gönderim 24 saat durduruldu. Bu sürede resmi uygulamayı kullanın.",
        );
      }
      if (!entry || known.get(session)?.status !== "WORKING") {
        throw new ProviderError("Bu numara WhatsApp'a bağlı değil");
      }
      // Gönderimler numara başına sıraya girer: insan hızında, arada bekleme ve kısa "yazıyor…".
      const previous = sendQueues.get(session) ?? Promise.resolve();
      const run = previous.then(async () => {
        const wait = (lastSentAt.get(session) ?? 0) + MIN_SEND_GAP_MS + Math.random() * SEND_JITTER_MS - Date.now();
        if (wait > 0) await sleep(wait);
        // Sırada beklerken numara kısıtlanmış ya da bağlantı değişmiş olabilir: göndermeden önce yeniden bak.
        const ready = () => !isRestricted(session) && entries.get(session) === entry && known.get(session)?.status === "WORKING";
        if (!ready()) throw new ProviderError(QUEUE_DROPPED);
        await entry.sock.sendPresenceUpdate("composing", chatId).catch(() => {});
        await sleep(TYPING_MS + Math.min(text.length * 15, 1500));
        if (!ready()) throw new ProviderError(QUEUE_DROPPED);
        await entry.sock.sendPresenceUpdate("paused", chatId).catch(() => {});
        try {
          const sent = await entry.sock.sendMessage(chatId, { text });
          rememberSent(sent?.key.id, sent?.message);
          return sent;
        } finally {
          lastSentAt.set(session, Date.now());
        }
      });
      sendQueues.set(
        session,
        run.then(
          () => {},
          () => {},
        ),
      );
      try {
        const sent = await run;
        return { providerId: sent?.key.id ?? null };
      } catch (err) {
        logger.warn({ err, session }, "mesaj gönderilemedi");
        if (err instanceof ProviderError) throw err; // kuyrukta iptal: açıklayıcı mesaj kullanıcıya gitsin
        throw new ProviderError("Mesaj gönderilemedi");
      }
    },

    async exists(session, chatId) {
      const entry = entries.get(session);
      if (!entry || known.get(session)?.status !== "WORKING") throw new ProviderError("Bu numara WhatsApp'a bağlı değil");
      const result = await entry.sock.onWhatsApp(chatId).catch(() => undefined);
      return Boolean(result?.[0]?.exists);
    },

    async deleteSession(session) {
      restrictedUntil.delete(session);
      // Bağlantı o anda kuruluyorsa önce bitmesi beklenir; yoksa kurulan soket kapatılmadan arka planda kalırdı.
      const pending = starting.get(session);
      if (pending) await pending.catch(() => {});
      const entry = close(session);
      if (entry) {
        entry.closing = true;
        // Bağlıysa telefondaki "Bağlı cihazlar" listesinden de çıkar.
        if (entry.sock.authState.creds.registered) await entry.sock.logout().catch(() => {});
        entry.sock.end(undefined);
      }
      known.delete(session);
      await rm(dirOf(session), { recursive: true, force: true });
    },

    async stop() {
      for (const session of [...entries.keys(), ...timers.keys()]) {
        const entry = close(session);
        if (!entry) continue;
        entry.closing = true;
        entry.sock.end(undefined);
      }
    },
  };
};
