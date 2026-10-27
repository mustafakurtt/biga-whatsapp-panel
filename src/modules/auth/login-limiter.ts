// Hatalı giriş sayaçları (bellekte). İki katman:
// - kullanıcı adı + IP: art arda 5 hatada 5 dakika kilit. Başka adresten gelen biri gerçek kullanıcıyı kilitleyemez.
// - IP: 15 dakikada 20 hatada o adres 15 dakika engellenir (çok sayıda kullanıcı adı deneyen tarayıcılar için).
type Counter = { count: number; first: number; until: number };

const MAX_KEYS = 10_000;

export const createLimiter = (opts: { max: number; windowMs: number; lockMs: number }) => {
  const map = new Map<string, Counter>();
  const prune = (now: number) => {
    for (const [key, e] of map) if (e.until <= now && e.first + opts.windowMs <= now) map.delete(key);
  };
  return {
    locked: (key: string): boolean => (map.get(key)?.until ?? 0) > Date.now(),
    fail(key: string) {
      const now = Date.now();
      let e = map.get(key);
      // Pencere dolduysa ya da kilit süresi bittiyse sayaç baştan başlar.
      if (!e || e.first + opts.windowMs <= now || (e.until > 0 && e.until <= now)) e = { count: 0, first: now, until: 0 };
      e.count++;
      if (e.count >= opts.max) e.until = now + opts.lockMs;
      map.set(key, e);
      if (map.size > MAX_KEYS) prune(now);
    },
    reset: (key: string) => void map.delete(key),
  };
};
