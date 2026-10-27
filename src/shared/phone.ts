// Telefon numarası biçimleri. WhatsApp kişi kimliği: ülke kodlu rakamlar + "@c.us" (ör. 905551112233@c.us).

// "+90 555 111 22 33", "0555…", "00905…" → "905551112233". Türkiye varsayılır (0 ile başlayan 11 hane).
export const normalizePhone = (input: string): string => {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;
  return digits;
};

export const isValidPhone = (digits: string): boolean => /^\d{10,15}$/.test(digits);

export const toChatId = (digits: string): string => `${digits}@c.us`;

// "905551112233@c.us" → "+90 555 111 22 33" benzeri okunur ad (kişi adı yoksa kullanılır).
export const displayFromRemote = (remoteId: string): string => {
  const [user = remoteId] = remoteId.split("@");
  return /^\d+$/.test(user) ? `+${user}` : user;
};
