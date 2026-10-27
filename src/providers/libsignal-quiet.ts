// libsignal (Baileys'in şifreleme kütüphanesi) oturum açıp kapatırken oturum nesnesini — özel anahtarlar dahil —
// doğrudan konsola yazıyor. Bu satırlar log'a düşmesin diye süzülür; diğer konsol çıktıları aynen geçer.
const NOISY = [
  "Closing session",
  "Opening session",
  "Removing old closed session",
  "Session already closed",
  "Session already open",
  "Closing open session",
  "Decrypted message with closed session",
  "Migrating session",
];

let installed = false;

export const silenceLibsignalSessionLogs = () => {
  if (installed) return;
  installed = true;
  for (const level of ["log", "info", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === "string" && NOISY.some((prefix) => first.startsWith(prefix))) return;
      original(...args);
    };
  }
};
