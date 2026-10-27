// Telefon numarası biçimleri. WhatsApp kişi kimliği: ülke kodlu rakamlar + "@s.whatsapp.net" (ör. 905551112233@s.whatsapp.net).

// "+90 555 111 22 33", "0555…", "00905…", "212 555 12 34" → ülke kodlu rakamlar. Türkiye varsayılır:
// 0 ile başlayan 11 hane ve 2–5 ile başlayan 10 hane. Başka ülke numarası ülke koduyla (+44…) yazılmalı.
export const normalizePhone = (input: string): string => {
  let digits = input.replace(/\D/g, "");
  // "+" ya da "00" ile yazıldıysa ülke kodu zaten vardır; Türkiye varsayımı yapılmaz.
  const international = /^\s*(\+|00)/.test(input);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (international) return digits;
  if (digits.length === 11 && digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  // 0 olmadan yazılmış 10 haneli Türkiye numarası: cep (5xx) ve sabit hat alan kodları (2xx, 3xx, 4xx).
  // Ör. "212 555 12 34" Fas (+212) değil İstanbul sabit hattıdır.
  if (digits.length === 10 && /^[2-5]/.test(digits)) digits = `90${digits}`;
  return digits;
};

// Türkiye (90) numaraları ülke koduyla tam 12 hanedir; fazla/eksik hane eşleştirme kodunu boşa çıkarır.
export const isValidPhone = (digits: string): boolean =>
  /^\d{10,15}$/.test(digits) && !(digits.startsWith("90") && digits.length !== 12);

export const toChatId = (digits: string): string => `${digits}@s.whatsapp.net`;

// Kişi adı: harf ya da rakam içermeyen ad ("." gibi) anlamsızdır, null döner (yerine numara gösterilir).
export const cleanName = (name: string | null | undefined): string | null => {
  const trimmed = (name ?? "").trim();
  return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed.slice(0, 80) : null;
};

// "905551112233@s.whatsapp.net" → "+905551112233" gibi okunur ad (kişi adı yoksa kullanılır).
export const displayFromRemote = (remoteId: string): string => {
  const [user = remoteId] = remoteId.split("@");
  return /^\d+$/.test(user) ? `+${user}` : user;
};
