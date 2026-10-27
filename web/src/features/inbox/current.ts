// Son seçilen numara (cihazda hatırlanır) ve sohbet yolları.
const KEY = "lastNumberId";

export function lastNumberId(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function rememberNumber(id: number): void {
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    // önemsiz
  }
}

export const numberPath = (numberId: number) => `/n/${numberId}`;
export const chatPath = (numberId: number, chatId: number) => `/n/${numberId}/c/${chatId}`;
