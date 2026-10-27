// WhatsApp'sız deneme sağlayıcısı. Eşleştirme kodu istenince numara bir saniye sonra "bağlandı" olur.
// Gelen mesaj taklidi için: POST /api/dev/inbound.
import QRCode from "qrcode";
import type { InboundHandler, MessagingProvider } from "../shared/contracts";
import type { NumberStatus } from "../shared/types";

export const MOCK_PAIRING_CODE = "MOCK1234";

export const createMockProvider = (opts: { onEvent: InboundHandler; connectDelayMs?: number }): MessagingProvider => {
  const { onEvent, connectDelayMs = 1000 } = opts;
  const sessions = new Map<string, { status: NumberStatus; meId: string | null }>();

  const setStatus = (session: string, status: NumberStatus, meId: string | null = null) => {
    sessions.set(session, { status, meId });
    onEvent({ kind: "status", session, status, meId });
  };

  return {
    async resume(list) {
      for (const session of list) sessions.set(session, { status: "WORKING", meId: null });
    },
    async createSession(session) {
      setStatus(session, "SCAN_QR_CODE");
    },
    async requestPairingCode(session, phone) {
      setTimeout(() => setStatus(session, "WORKING", `${phone}@s.whatsapp.net`), connectDelayMs);
      return MOCK_PAIRING_CODE;
    },
    async getQr() {
      return new Uint8Array(await QRCode.toBuffer("mock-whatsapp-panel", { type: "png", width: 320, margin: 2 }));
    },
    async getStatus(session) {
      return sessions.get(session) ?? { status: "STOPPED", meId: null };
    },
    async sendText() {
      return { providerId: `mock_${crypto.randomUUID()}` };
    },
    async deleteSession(session) {
      sessions.delete(session);
    },
    async stop() {},
  };
};
