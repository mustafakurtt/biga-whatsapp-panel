// Baileys mesajını panelde gösterilecek düz metne çevirir. Medya içeriği indirilmez, etiketle gösterilir.
import { getContentType, normalizeMessageContent, type WAMessageContent } from "baileys";

// Panelde mesaj olarak gösterilmeyen teknik türler (tepki, silme/düzenleme bildirimi, anket oyu…).
const IGNORED = new Set<string>([
  "protocolMessage",
  "reactionMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo",
  "pollUpdateMessage",
  "keepInChatMessage",
  "pinInChatMessage",
  "encReactionMessage",
]);

const withCaption = (label: string, caption: string | null | undefined) => (caption ? `${label} ${caption}` : label);

// Gösterilecek bir şey yoksa null.
export const textOf = (raw: WAMessageContent | null | undefined): string | null => {
  const content = normalizeMessageContent(raw);
  if (!content) return null;
  const type = getContentType(content);
  if (!type || IGNORED.has(type)) return null;

  switch (type) {
    case "conversation":
      return content.conversation || null;
    case "extendedTextMessage":
      return content.extendedTextMessage?.text || null;
    case "imageMessage":
      return withCaption("[Fotoğraf]", content.imageMessage?.caption);
    case "videoMessage":
      return withCaption("[Video]", content.videoMessage?.caption);
    case "audioMessage":
      return "[Ses kaydı]";
    case "documentMessage":
      return withCaption("[Belge]", content.documentMessage?.fileName);
    case "stickerMessage":
      return "[Çıkartma]";
    case "locationMessage":
    case "liveLocationMessage":
      return "[Konum]";
    case "contactMessage":
    case "contactsArrayMessage":
      return "[Kişi kartı]";
    case "pollCreationMessage":
    case "pollCreationMessageV2":
    case "pollCreationMessageV3":
      return "[Anket]";
    default:
      return "[Desteklenmeyen mesaj]";
  }
};

// Baileys zaman damgası saniye cinsinden; number ya da Long gelebilir.
export const timestampMs = (value: unknown): number => {
  const seconds =
    typeof value === "number"
      ? value
      : typeof (value as { toNumber?: () => number } | null)?.toNumber === "function"
        ? (value as { toNumber: () => number }).toNumber()
        : Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Date.now();
};
