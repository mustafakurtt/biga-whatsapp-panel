// İzin kataloğu. Roller bu anahtarların listesidir; "*" tüm izinler demektir (Patron).

export const PERMISSIONS = [
  { key: "numbers.view_all", label: "Atama olmadan tüm numaraları görür", group: "Numaralar" },
  { key: "numbers.manage", label: "Numara ekler, siler, bağlar", group: "Numaralar" },
  { key: "messages.send", label: "Yazma erişimi olan numaralarda mesaj gönderir", group: "Mesajlar" },
  { key: "chats.start", label: "Yeni sohbet başlatır", group: "Mesajlar" },
  { key: "chats.assign", label: "Sohbeti başkasına atar", group: "Mesajlar" },
  { key: "quick_replies.manage", label: "Hazır yanıtları yönetir", group: "Mesajlar" },
  { key: "tags.manage", label: "Etiketleri yönetir", group: "Mesajlar" },
  { key: "users.manage", label: "Kullanıcıları ve rolleri yönetir", group: "Yönetim" },
  { key: "impersonate.view", label: "Başka kullanıcının ekranına geçer (izler)", group: "Ekranına geç" },
  { key: "impersonate.send", label: "Başkasının ekranındayken mesaj gönderir", group: "Ekranına geç" },
  { key: "audit.view", label: "Etkinlik kaydını görür", group: "Denetim" },
  { key: "reports.view", label: "Raporları görür", group: "Denetim" },
  { key: "data.export", label: "Sohbet dökümünü ve etkinlik kaydını indirir (CSV)", group: "Denetim" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

const KNOWN = new Set<string>(ALL_PERMISSIONS);

// Ekranına geçilmişken hiç verilmeyen izinler (yönetim ve iç içe geçiş).
const NEVER_WHEN_IMPERSONATING: Permission[] = ["users.manage", "impersonate.view", "impersonate.send"];
// `impersonate.send` yoksa (izleme modu) sadece bunlar kalır: hiçbir değişiklik yapılamaz.
const WATCH_ONLY_KEEP = new Set<Permission>(["numbers.view_all", "audit.view", "reports.view"]);

// Veritabanındaki JSON'u izin listesine çevirir; "*" hepsine açılır, bilinmeyenler atılır.
export const parsePermissions = (json: string): Permission[] => {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  if (raw.includes("*")) return [...ALL_PERMISSIONS];
  return ALL_PERMISSIONS.filter((p) => raw.includes(p));
};

export const isPermission = (value: string): value is Permission => KNOWN.has(value);

// a, b'nin alt kümesi mi? (Kimse ekranına geçerek yetki kazanamasın.)
export const isSubset = (a: Permission[], b: Permission[]): boolean => {
  const set = new Set(b);
  return a.every((p) => set.has(p));
};

// Ekranına geçilmişken etkin izinler.
export const impersonatedPermissions = (target: Permission[], actor: Permission[]): Permission[] => {
  const actorSet = new Set(actor);
  const watchOnly = !actorSet.has("impersonate.send");
  return target.filter(
    (p) => actorSet.has(p) && !NEVER_WHEN_IMPERSONATING.includes(p) && (!watchOnly || WATCH_ONLY_KEEP.has(p)),
  );
};
