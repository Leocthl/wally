// Proof screen logic: reason and check words (copied from the offline verifier page), a safe fallback for codes this
// screen does not know, the tampered field in words, the chain strip window, and where the check ran.
import { describe, expect, it } from "vitest";
import { UI } from "../src/i18n/ui";
import { chainWindow, checkWords, fieldWords, linkStates, ranOnDevice, reasonWords } from "../src/screens/proof/verifyWords";

describe("reason words", () => {
  it("has the verifier page's sentence for every current code, and for the codes landing soon", () => {
    for (const code of ["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "SIGNATURE", "PAYLOAD_SIGNATURE", "TRUNCATED", "KEYS", "NO_DECISION", "DUPLICATE", "CONSENT", "OVERSPEND", "AFTER_REVOKE"]) {
      const words = reasonWords(code);
      expect(words, code).not.toBeNull();
      expect(words?.en.length).toBeGreaterThan(10);
      expect(words?.zh.length).toBeGreaterThan(4);
    }
    expect(reasonWords("PAYLOAD_HASH")?.en).toBe("The content of this entry changed after it was written.");
  });

  it("returns null for an unknown code so the screen can say so and show the code", () => {
    expect(reasonWords("SOMETHING_NEW")).toBeNull();
    expect(reasonWords("__proto__")).toBeNull();
    expect(reasonWords("toString")).toBeNull();
    expect(checkWords("SOMETHING_NEW")).toBeNull();
    expect(checkWords("SIGNATURE")).toEqual(UI.proof.checks.SIGNATURE);
  });
});

describe("tampered field", () => {
  it("names the amounts the tamper demo changes, and falls back for anything else", () => {
    expect(fieldWords("cart.total_minor")).toEqual({ words: UI.proof.fieldTotal, money: true });
    expect(fieldWords("limit_minor")).toEqual({ words: UI.proof.fieldLimit, money: true });
    expect(fieldWords("amount_minor")).toEqual({ words: UI.proof.fieldAmount, money: true });
    expect(fieldWords("credentialSubject.rules.budget.amount_minor")).toEqual({ words: UI.proof.fieldBudget, money: true });
    expect(fieldWords("ts")).toEqual({ words: UI.proof.fieldOther, money: false });
    expect(fieldWords("payload.other_minor").money).toBe(true);
  });
});

describe("chain strip", () => {
  it("shows every link when the log is short", () => {
    expect(chainWindow(5, null, 24)).toEqual({ start: 0, end: 5 });
  });

  it("shows the newest links when there is no failure, and centres a failure otherwise", () => {
    expect(chainWindow(200, null, 24)).toEqual({ start: 176, end: 200 });
    expect(chainWindow(200, 100, 24)).toEqual({ start: 88, end: 112 });
    expect(chainWindow(200, 2, 24)).toEqual({ start: 0, end: 24 });
    expect(chainWindow(200, 199, 24)).toEqual({ start: 176, end: 200 });
    expect(chainWindow(0, null, 24)).toEqual({ start: 0, end: 0 });
  });

  it("marks links verified, broken, or not checked after a break", () => {
    expect(linkStates({ start: 0, end: 4 }, null)).toEqual(["idle", "idle", "idle", "idle"]);
    expect(linkStates({ start: 0, end: 4 }, { ok: true })).toEqual(["ok", "ok", "ok", "ok"]);
    expect(linkStates({ start: 0, end: 5 }, { ok: false, failedSeq: 2 })).toEqual(["ok", "ok", "fail", "after", "after"]);
  });
});

describe("where the check ran", () => {
  it("is this device for the on-device and offline clients, and the booth server for the HTTP client", () => {
    expect(ranOnDevice("mock")).toBe(true);
    expect(ranOnDevice("local")).toBe(true);
    expect(ranOnDevice("http")).toBe(false);
  });
});
