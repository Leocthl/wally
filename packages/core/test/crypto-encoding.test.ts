// A-17: strict encoders. A decoder must reject every non-canonical spelling, otherwise a log line could
// change by one byte and still verify (T-V1).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CryptoError,
  fromBase58btc,
  fromBase64url,
  fromHex,
  fromMultibase58btc,
  toBase58btc,
  toBase64url,
  toHex,
  toMultibase58btc,
} from "../src/crypto";
import { indepBase58, indepBase64url, indepHex } from "./crypto-independent";

const bytes = fc.uint8Array({ minLength: 0, maxLength: 80 });

describe("hex", () => {
  it("round-trips and matches the independent encoder", () => {
    fc.assert(fc.property(bytes, (b) => toHex(b) === indepHex(b) && toHex(fromHex(toHex(b))) === toHex(b)));
  });

  it("rejects uppercase, odd length and non-hex", () => {
    for (const bad of ["AB", "abc", "zz", " ab"]) expect(() => fromHex(bad)).toThrow(CryptoError);
  });
});

describe("base64url (no padding)", () => {
  it("round-trips and matches the independent encoder", () => {
    fc.assert(fc.property(bytes, (b) => toBase64url(b) === indepBase64url(b) && toHex(fromBase64url(toBase64url(b))) === toHex(b)));
  });

  it("rejects padding, the standard alphabet and non-zero trailing bits", () => {
    const sig = toBase64url(new Uint8Array(64).fill(7));
    expect(sig).toHaveLength(86);
    expect(() => fromBase64url(`${sig}==`)).toThrow(CryptoError);
    expect(() => fromBase64url("ab+/")).toThrow(CryptoError);
    // The last of 86 characters carries 2 data bits; changing only its lowest spare bit must not decode.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const sibling = alphabet.charAt(alphabet.indexOf(sig.at(-1) ?? "A") ^ 1);
    expect(() => fromBase64url(sig.slice(0, -1) + sibling)).toThrow(CryptoError);
    expect(toHex(fromBase64url(sig))).toBe("07".repeat(64));
  });
});

describe("base58btc and multibase", () => {
  it("round-trips and matches the independent encoder, leading zeros included", () => {
    fc.assert(
      fc.property(bytes, (b) => toBase58btc(b) === indepBase58(b) && toHex(fromBase58btc(toBase58btc(b))) === toHex(b)),
    );
    expect(toBase58btc(new Uint8Array([0, 0, 1]))).toBe("112");
  });

  it("matches a published vector ('Hello World!' in the base58 draft)", () => {
    expect(toBase58btc(new TextEncoder().encode("Hello World!"))).toBe("2NEpo7TZRRrLZSi2U");
  });

  it("multibase uses the 'z' prefix and rejects anything else", () => {
    const value = new Uint8Array([1, 2, 3]);
    expect(toMultibase58btc(value)).toBe(`z${toBase58btc(value)}`);
    expect(toHex(fromMultibase58btc(toMultibase58btc(value)))).toBe("010203");
    for (const bad of ["", "Ldp", "uAQID", "z0OIl", "z"]) expect(() => fromMultibase58btc(bad)).toThrow(CryptoError);
  });
});
