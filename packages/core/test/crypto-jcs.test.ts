// A-17: RFC 8785 (JCS) through the canonicalize package, checked on vectors from the RFC itself.
import { describe, expect, it } from "vitest";
import { CryptoError, jcs, jcsSha256Hex, sha256Hex } from "../src/crypto";
import { indepJcs, indepSha256Hex } from "./crypto-independent";

describe("jcs (RFC 8785)", () => {
  it("sorts properties by UTF-16 code units (RFC 8785 section 3.2.3)", () => {
    const input = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      "דּ": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "😀": "Emoji: Grinning Face",
      "\u0080": "Control",
      "ö": "Latin Small Letter O With Diaeresis",
    };
    // Asserted on the text: JSON.parse would move the integer-like key "1" first again.
    expect(jcs(input)).toBe(
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis",' +
        '"€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
    );
  });

  it("serialises numbers, strings and literals as in RFC 8785 section 3.2.2", () => {
    const input = JSON.parse(
      '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],' +
        '"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}',
    ) as unknown;
    expect(jcs(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
        '"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it.each([
    ["0000000000000000", "0"],
    ["8000000000000000", "0"],
    ["0000000000000001", "5e-324"],
    ["8000000000000001", "-5e-324"],
    ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["ffefffffffffffff", "-1.7976931348623157e+308"],
    ["4340000000000000", "9007199254740992"],
    ["c340000000000000", "-9007199254740992"],
    ["4430000000000000", "295147905179352830000"],
    ["44b52d02c7e14af5", "9.999999999999997e+22"],
    ["44b52d02c7e14af6", "1e+23"],
    ["44b52d02c7e14af7", "1.0000000000000001e+23"],
    ["444b1ae4d6e2ef4e", "999999999999999700000"],
    ["444b1ae4d6e2ef4f", "999999999999999900000"],
    ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
    ["3eb0c6f7a0b5ed8d", "0.000001"],
    ["41b3de4355555553", "333333333.3333332"],
    ["41b3de4355555554", "333333333.33333325"],
    ["41b3de4355555555", "333333333.3333333"],
    ["41b3de4355555556", "333333333.3333334"],
    ["41b3de4355555557", "333333333.33333343"],
    ["becbf647612f3696", "-0.0000033333333333333333"],
    ["43143ff3c1cb0959", "1424953923781206.2"],
  ])("serialises IEEE-754 0x%s as %s (RFC 8785 appendix B)", (bits, expected) => {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${bits}`));
    expect(jcs(view.getFloat64(0))).toBe(expected);
  });

  it("rejects values without a canonical form", () => {
    expect(() => jcs(Number.NaN)).toThrow(CryptoError);
    expect(() => jcs(Number.POSITIVE_INFINITY)).toThrow(CryptoError);
    expect(() => jcs({ s: "\ud800" })).toThrow(CryptoError);
    expect(() => jcs(undefined)).toThrow(CryptoError);
    expect(() => jcs(10n)).toThrow(CryptoError);
  });

  it("agrees with the independent canonicaliser on nested ASCII data", () => {
    const value = { z: [3, { b: null, a: true }], a: "x\"y", m: { k2: -1, k1: 0 } };
    expect(jcs(value)).toBe(indepJcs(value));
  });
});

describe("sha256", () => {
  it("hashes UTF-8 text to lowercase hex (FIPS 180-4 'abc' vector)", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(sha256Hex("abc"));
  });

  it("jcsSha256Hex = hex SHA-256 of the UTF-8 JCS string", () => {
    const value = { b: 2, a: [1, "é"] };
    expect(jcsSha256Hex(value)).toBe(indepSha256Hex(indepJcs(value)));
    expect(jcsSha256Hex({ a: [1, "é"], b: 2 })).toBe(jcsSha256Hex(value));
  });
});
