import { describe, expect, test } from "bun:test";
import { textOf, timestampMs } from "../src/providers/baileys.messages";
import { normalizePhone } from "../src/shared/phone";

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

test("telefon: Türkiye varsayımı yalnızca ülke kodu yazılmadıysa", () => {
  expect(normalizePhone("212 555 12 34")).toBe("902125551234"); // İstanbul sabit hat, Fas değil
  expect(normalizePhone("0212 555 12 34")).toBe("902125551234");
  expect(normalizePhone("555 111 22 33")).toBe("905551112233");
  expect(normalizePhone("+90 555 111 22 33")).toBe("905551112233");
  expect(normalizePhone("+212 612 345 678")).toBe("212612345678"); // gerçek Fas numarası
  expect(normalizePhone("+49 301 234567")).toBe("49301234567");
  expect(normalizePhone("00 44 7700 900123")).toBe("447700900123");
});
