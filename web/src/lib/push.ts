// Service worker kaydı ve Web Push aboneliği. SW: /sw.js (vite-plugin-pwa injectManifest, kaynak src/sw.ts).
import { useSyncExternalStore } from "react";
import { get, post } from "../api/client";

export interface PushState {
  /** Tarayıcı Push API'sini destekliyor mu (iOS'ta yalnızca ana ekrana eklenmiş uygulamada). */
  supported: boolean;
  /** Sunucuda VAPID anahtarı var mı. */
  serverEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  ready: boolean;
}

let state: PushState = { supported: false, serverEnabled: false, permission: "unsupported", subscribed: false, ready: false };
let publicKey = "";
const listeners = new Set<() => void>();
const set = (patch: Partial<PushState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const usePush = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iOS'ta push yalnızca ana ekrana eklenmiş uygulamada çalışır (iOS 16.4+). */
export const needsInstallForPush = () => isIOS() && !isStandalone();

const permissionNow = (): PushState["permission"] => ("Notification" in window ? Notification.permission : "unsupported");

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Çıkışta: bu tarayıcının aboneliğini sunucudan siler; çıkış yapılan cihaza bildirim (mesaj önizlemesi) gitmez.
 *  Tarayıcıdaki abonelik kalır; bu cihazda biri giriş yapınca initPush onu o kişiye bağlar. */
export async function forgetPushOnServer(): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) await post("/api/push/unsubscribe", { endpoint: sub.endpoint });
  } catch {
    // önemsiz: oturum zaten kapanıyor
  }
}

/** Oturum açılınca: anahtar, izin ve abonelik durumunu okur. rebind=true ise var olan aboneliği bu kullanıcıya bağlar. */
export async function initPush({ rebind }: { rebind: boolean }): Promise<void> {
  try {
    publicKey = (await get<{ publicKey: string }>("/api/push/key")).publicKey || "";
  } catch {
    publicKey = "";
  }
  const supported = pushSupported() && Boolean(await registerSW());
  let subscribed = false;
  if (supported && publicKey) {
    try {
      const sub = await currentSubscription();
      subscribed = Boolean(sub);
      if (rebind && permissionNow() === "granted") {
        // Aynı telefonda hesap değişmiş olabilir: aboneliği oturumdaki kişiye bağla (yoksa sessizce yeniden oluştur).
        if (sub) await post("/api/push/subscribe", sub.toJSON());
        else {
          await subscribe();
          subscribed = true;
        }
      }
    } catch {
      // önemsiz
    }
  }
  set({ supported, serverEnabled: Boolean(publicKey), permission: permissionNow(), subscribed, ready: true });
}

async function subscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await post("/api/push/subscribe", sub.toJSON());
}

export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  set({ permission: perm });
  if (perm !== "granted") throw new Error("Bildirim izni verilmedi");
  await subscribe();
  set({ subscribed: true });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (sub) {
    try {
      await post("/api/push/unsubscribe", { endpoint: sub.endpoint });
    } finally {
      await sub.unsubscribe();
    }
  }
  set({ subscribed: false });
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Kurulu PWA'da simge rozeti: okunmamış toplamı */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    // desteklenmiyor
  }
}
