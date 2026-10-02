// Audit (lane s-audit): bypasses of the free-text I8 guard (log/i8.ts). The guard is defence in depth (no
// schema has a PAN field and the rail has none), but intent_text, revoke reasons and rule inputs are free
// text that is sealed, signed and exported. PANs are built at runtime (Luhn-valid, no literal in the repo).
// Fixed (lane s-fix-crypto): NFKC, format characters stripped, any decimal digit, [\s./_-]{0,3} separators,
// normalised key names and CVV wording.
import { describe, expect, it } from "vitest";
import { findCardData } from "../src/log";
import { luhnValidDigits } from "./crypto-independent";

const PAN = luhnValidDigits(16, "4");
const groups = (sep: string) => PAN.match(/.{4}/g)!.join(sep);
const fullwidth = (s: string) => s.replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
const ZWSP = String.fromCharCode(0x200b);

describe("controls: what the guard catches", () => {
  it.each([
    ["plain", PAN],
    ["single spaces", groups(" ")],
    ["dashes", groups("-")],
  ])("flags a PAN with %s", (_name, text) => {
    expect(findCardData({ reason: text })).not.toBeNull();
  });

  it("flags exact card-data key names and 'cvv 123'", () => {
    expect(findCardData({ card_number: "x" })).not.toBeNull();
    expect(findCardData({ reason: "cvv 123" })).not.toBeNull();
  });
});

describe("S-I8-1 (fixed): common PAN and CVV spellings are caught by the guard", () => {
  it.each([
    ["dots", groups(".")],
    ["slashes", groups("/")],
    ["double spaces", groups("  ")],
    ["no-break spaces", groups(String.fromCharCode(0xa0))],
    ["fullwidth digits (HK input methods)", fullwidth(PAN)],
    ["zero-width spaces between digits", PAN.split("").join(ZWSP)],
  ])("flags a PAN written with %s", (_name, text) => {
    expect(findCardData({ reason: text })).not.toBeNull();
  });

  it("flags card-data keys spelled with dashes or abbreviations", () => {
    for (const key of ["card-number", "card_no", "cc_number", "cvv_code"]) expect(findCardData({ [key]: "x" })).not.toBeNull();
  });

  it("flags 'cvv123', 'security code 123' and a fullwidth PAN", () => {
    for (const text of ["cvv123", "security code 123", fullwidth(PAN)]) expect(findCardData({ reason: text })).not.toBeNull();
  });
});
