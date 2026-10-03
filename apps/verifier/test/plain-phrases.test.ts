// The plain sentences that take a value. The change note says only what is true: the check "caught it" only when it did, a
// value is shown only when it is an amount that reads as HK$, and nothing quoted from a log line is ever echoed back.
import { describe, expect, it } from "vitest";
import { passBody, passLede, plainSourceLine, tamperSentence, tamperWhat } from "../src/plain/phrases";

const CAUGHT_EN = ", and the check caught it, because each receipt is locked to the one before it";
const CAUGHT_ZH = "，檢查即時發現，因為每張收據都與上一張鎖在一起";

describe("tamperSentence", () => {
  it("is the shared table's sentence for an amount the check caught", () => {
    const sentence = tamperSentence("payload.approved_limit_minor", 2, "25900", "35900", true);
    expect(sentence.en).toBe(
      "We changed the approved amount on receipt 2 in a copy, from HK$259 to HK$359, and the check caught it, because each receipt is locked to the one before it. Your real receipts were not touched.",
    );
    expect(sentence.zh).toBe("我們在副本中把第 2 張收據的批准金額由 HK$259 改成 HK$359，檢查即時發現，因為每張收據都與上一張鎖在一起。你真正的收據原封不動。");
  });

  it("makes no claim about the check when it did not catch the change", () => {
    const sentence = tamperSentence("payload.approved_limit_minor", 2, "25900", "35900", false);
    expect(sentence.en).toBe("We changed the approved amount on receipt 2 in a copy, from HK$259 to HK$359. Your real receipts were not touched.");
    expect(sentence.zh).toBe("我們在副本中把第 2 張收據的批准金額由 HK$259 改成 HK$359。你真正的收據原封不動。");
    expect(sentence.en).not.toContain("caught");
    expect(sentence.zh).not.toContain("發現");
  });

  it.each([
    ["payload.limit_minor", "the card limit", "卡的額度", "50000", "HK$500"],
    ["payload.amount_minor", "the charged amount", "扣款金額", "12050", "HK$120.50"],
  ] as const)("%s reads as %s", (field, what, whatZh, before, shown) => {
    const sentence = tamperSentence(field, 3, before, "99999", true);
    expect(sentence.en).toContain(`We changed ${what} on receipt 3 in a copy, from ${shown} to HK$999.99`);
    expect(sentence.zh).toContain(`${whatZh}由 ${shown} 改成 HK$999.99`);
  });

  it("leaves the values out for a time, caught or not: a time is never quoted from the log", () => {
    const before = "2026-10-03T02:00:01.000Z";
    const after = "2026-10-03T02:00:01.001Z";
    const caught = tamperSentence("ts", 1, before, after, true);
    expect(caught.en).toBe(`We changed the time on receipt 1 in a copy${CAUGHT_EN}. Your real receipts were not touched.`);
    expect(caught.zh).toBe(`我們在副本中改動了第 1 張收據的時間${CAUGHT_ZH}。你真正的收據原封不動。`);
    const missed = tamperSentence("ts", 1, before, after, false);
    expect(missed.en).toBe("We changed the time on receipt 1 in a copy. Your real receipts were not touched.");
    expect(missed.zh).toBe("我們在副本中改動了第 1 張收據的時間。你真正的收據原封不動。");
    for (const text of [caught.en, caught.zh, missed.en, missed.zh]) expect(text).not.toMatch(/2026|T02|001/);
  });

  it("leaves the values out when an amount is not plain digits, and never echoes them", () => {
    const sentence = tamperSentence("payload.amount_minor", 4, "MANDATE_SEALED", "1.5", true);
    expect(sentence.en).toBe(`We changed the charged amount on receipt 4 in a copy${CAUGHT_EN}. Your real receipts were not touched.`);
    expect(sentence.en + sentence.zh).not.toMatch(/MANDATE|1\.5/);
  });

  it("calls a field it does not know 'a value', whatever its name", () => {
    expect(tamperWhat("payload.something_new")).toEqual({ en: "a value", zh: "一個數值" });
    expect(tamperWhat("constructor")).toEqual({ en: "a value", zh: "一個數值" });
    expect(tamperWhat("__proto__")).toEqual({ en: "a value", zh: "一個數值" });
    expect(tamperSentence("__proto__", 1, "1", "2", false).en).toBe("We changed a value on receipt 1 in a copy. Your real receipts were not touched.");
  });
});

describe("plainSourceLine", () => {
  it("says where the text came from", () => {
    expect(plainSourceLine("log", "demo", "x").en).toBe("Sample receipts for practice (SIMULATED).");
    expect(plainSourceLine("keys", "demo", "x").en).toBe("Sample public keys for practice (SIMULATED).");
    expect(plainSourceLine("checkpoint", "demo", "x").en).toBe("Sample checkpoint for practice (SIMULATED).");
    expect(plainSourceLine("log", "typed", "x").en).toBe("You pasted or typed this.");
    expect(plainSourceLine("log", "tampered", "x").en).toBe("A changed copy. One digit differs from the original.");
    expect(plainSourceLine("log", "file:my.jsonl", "x").en).toBe("Loaded from file my.jsonl.");
  });

  it("says Empty. for a box that holds nothing, however it got that way", () => {
    for (const source of ["empty", "typed", "demo", "file:a.jsonl", "tampered"] as const) {
      expect(plainSourceLine("log", source, "").en, source).toBe("Empty.");
      expect(plainSourceLine("log", source, " \n\t ").en, source).toBe("Empty.");
    }
    expect(plainSourceLine("log", "typed", "").zh).toBe("未有內容。");
  });
});

describe("the pass sentences", () => {
  it("count the receipts, and say 'the receipt' for one", () => {
    expect(passLede(10).en).toBe("All 10 receipts are untouched.");
    expect(passLede(1).en).toBe("The receipt is untouched.");
    expect(passBody(10).en).toBe("Nothing was changed, removed or moved since Wally wrote them.");
    expect(passBody(1).en).toBe("Nothing was changed, removed or moved since Wally wrote it.");
  });
});
