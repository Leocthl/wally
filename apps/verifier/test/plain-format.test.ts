// Plain mode shows a time as Hong Kong time ("3 Oct 2026, 10:05") and a money field as HK$ ("25900" is HK$259). Both read
// UNVERIFIED text, so a value that does not parse is shown as it is, never guessed and never thrown on.
import { describe, expect, it } from "vitest";
import { hkdFromMinor, hkTime, parseIso } from "../src/plain/format";

describe("parseIso", () => {
  it.each([
    ["2026-10-03T02:00:01.000Z", Date.UTC(2026, 9, 3, 2, 0, 1)],
    ["2026-10-03T02:00:01Z", Date.UTC(2026, 9, 3, 2, 0, 1)],
    ["2026-10-03T02:00Z", Date.UTC(2026, 9, 3, 2, 0, 0)],
    ["2026-10-03T10:00:01+08:00", Date.UTC(2026, 9, 3, 2, 0, 1)],
    ["2026-10-03T00:00:01-02:30", Date.UTC(2026, 9, 3, 2, 30, 1)],
    ["2026-10-03T02:00:01.5Z", Date.UTC(2026, 9, 3, 2, 0, 1, 500)],
    ["2026-10-03T02:00:01.123456Z", Date.UTC(2026, 9, 3, 2, 0, 1, 123)],
    ["2024-02-29T00:00:00Z", Date.UTC(2024, 1, 29)],
  ] as const)("reads %s", (text, expected) => {
    expect(parseIso(text)).toBe(expected);
  });

  it.each([
    "",
    "yesterday",
    "10",
    "2026-10-03",
    "2026-10-03T02:00:01",
    "2026-10-03 02:00:01Z",
    "2026-13-03T02:00:01Z",
    "2026-00-03T02:00:01Z",
    "2026-10-32T02:00:01Z",
    "2026-10-00T02:00:01Z",
    "2026-10-03T24:00:00Z",
    "2026-10-03T02:60:00Z",
    "2026-10-03T02:00:60Z",
    "2026-02-30T00:00:00Z",
    "2025-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "0050-10-03T02:00:01Z",
    "2026-10-03T02:00:01+8:00",
    "2026-10-03T02:00:01+25:00",
    "2026-10-03T02:00:01Zextra",
    " 2026-10-03T02:00:01Z",
    "<img src=x onerror=1>",
    "9".repeat(5000),
  ])("refuses %j", (text) => {
    expect(parseIso(text)).toBeNull();
  });
});

describe("hkTime", () => {
  it("shows Hong Kong time, in both languages", () => {
    expect(hkTime("2026-10-03T02:05:00.000Z")).toEqual({ en: "3 Oct 2026, 10:05", zh: "2026年10月3日 10:05" });
    expect(hkTime("2026-10-03T02:00:01.000Z")).toEqual({ en: "3 Oct 2026, 10:00", zh: "2026年10月3日 10:00" });
  });

  it("converts a time given with an offset, and rolls over midnight and the new year", () => {
    expect(hkTime("2026-10-03T10:05:00+08:00")?.en).toBe("3 Oct 2026, 10:05");
    expect(hkTime("2026-10-02T22:05:00-04:00")?.en).toBe("3 Oct 2026, 10:05");
    expect(hkTime("2026-12-31T17:00:00Z")).toEqual({ en: "1 Jan 2027, 01:00", zh: "2027年1月1日 01:00" });
    expect(hkTime("2026-10-03T16:00:00Z")?.en).toBe("4 Oct 2026, 00:00");
  });

  it("names every month with the same three letters", () => {
    const names = Array.from({ length: 12 }, (_, i) => hkTime(`2026-${String(i + 1).padStart(2, "0")}-15T04:00:00Z`)?.en.split(" ")[1]);
    expect(names).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });

  it("gives nothing for text that is not a time: the caller says the time is not readable, the text is never echoed", () => {
    for (const text of ["yesterday", "2026-10-03", "<b>x</b>", "", "MANDATE_REVOKED", "2026-02-30T00:00:00Z", "10"]) {
      expect(hkTime(text), text).toBeNull();
    }
  });

  it("never throws, whatever the text", () => {
    for (const text of ["", "\u0000", "2026-10-03T02:00:01Z\n", "constructor", "__proto__", "9".repeat(100_000)]) {
      expect(() => hkTime(text)).not.toThrow();
    }
  });
});

describe("hkdFromMinor", () => {
  it.each([
    ["25900", "HK$259"],
    ["35900", "HK$359"],
    ["25950", "HK$259.50"],
    ["25901", "HK$259.01"],
    ["100", "HK$1"],
    ["99", "HK$0.99"],
    ["5", "HK$0.05"],
    ["0", "HK$0"],
    ["000", "HK$0"],
    ["007", "HK$0.07"],
    ["123456789", "HK$1,234,567.89"],
    ["100000", "HK$1,000"],
    ["80000", "HK$800"],
  ] as const)("%s is %s", (minor, shown) => {
    expect(hkdFromMinor(minor)).toBe(shown);
  });

  it.each(["", "-5", "1.5", "12a", " 5", "5 ", "1e3", "NaN", "9".repeat(19), "１２"])("gives nothing for %j", (text) => {
    expect(hkdFromMinor(text)).toBeNull();
  });
});
