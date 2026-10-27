// Gerçek (Baileys) ve test (mock) numaralar aynı panelde: her çağrı numaranın türüne göre doğru sağlayıcıya gider.
// Tür numbers.provider sütununda durur.
import type { Database } from "../db/client";
import { type MessagingProvider, ProviderError } from "../shared/contracts";
import type { ProviderKind } from "../shared/types";

export const createRoutingProvider = (
  db: Database,
  providers: Partial<Record<ProviderKind, MessagingProvider>>,
): MessagingProvider => {
  const kindOf = (session: string): ProviderKind | null =>
    db.query<{ provider: ProviderKind }, [string]>("SELECT provider FROM numbers WHERE session = ?").get(session)?.provider ??
    null;
  const pick = (session: string): MessagingProvider => {
    const kind = kindOf(session);
    const provider = kind ? providers[kind] : undefined;
    if (!provider) throw new ProviderError(kind === "mock" ? "Test numaraları bu sunucuda kapalı" : "Numara bulunamadı");
    return provider;
  };
  const all = Object.values(providers).filter((p): p is MessagingProvider => Boolean(p));

  return {
    async resume(sessions) {
      for (const [kind, provider] of Object.entries(providers) as [ProviderKind, MessagingProvider | undefined][]) {
        if (provider) await provider.resume(sessions.filter((s) => kindOf(s) === kind));
      }
    },
    createSession: (session) => pick(session).createSession(session),
    requestPairingCode: (session, phone) => pick(session).requestPairingCode(session, phone),
    getQr: (session) => pick(session).getQr(session),
    getStatus: (session) => pick(session).getStatus(session),
    sendText: (session, chatId, text) => pick(session).sendText(session, chatId, text),
    exists: (session, chatId) => pick(session).exists(session, chatId),
    deleteSession: (session) => pick(session).deleteSession(session),
    async stop() {
      await Promise.all(all.map((p) => p.stop()));
    },
  };
};
