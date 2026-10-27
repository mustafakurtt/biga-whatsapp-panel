import { describe, expect, test } from "bun:test";
import { textOf, timestampMs } from "../src/providers/baileys.messages";

describe("textOf", () => {
  test("metin, medya ve teknik mesajlar", () => {
    expect(textOf({ conversation: "selam" })).toBe("selam");
    expect(textOf({ extendedTextMessage: { text: "uzun" } })).toBe("uzun");
    expect(textOf({ imageMessage: { caption: "fatura" } })).toBe("[Fotoğraf] fatura");
    expect(textOf({ audioMessage: {} })).toBe("[Ses kaydı]");
    expect(textOf({ ephemeralMessage: { message: { conversation: "kaybolan" } } })).toBe("kaybolan");
    expect(textOf({ reactionMessage: { text: "👍" } })).toBeNull();
    expect(textOf({ protocolMessage: {} })).toBeNull();
    expect(textOf(null)).toBeNull();
  });

  test("zaman damgası saniyeden milisaniyeye", () => {
    expect(timestampMs(1700000000)).toBe(1700000000000);
    expect(timestampMs({ toNumber: () => 5 })).toBe(5000);
  });
});
