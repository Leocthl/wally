// The words on screen in plain mode. A person who cannot read a hash must meet none of these words in the header, the
// buttons, the verdict, the change note, the receipts list or a notice. The two places where they may stay are the
// collapsed "Show the details" blocks and the collapsed box panel; the walk leaves exactly those out (visibleText).
import type { VerifyFailure } from "@wally/core/verify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS } from "../src/limits";
import { renderPlainResult } from "../src/render/plain-result";
import { runVerification } from "../src/run";
import { CHECKPOINT, domTools, joinLines, KEYS, LINES, LOG, langText, mountPlain, resetMode, visibleText, type Lang } from "./helpers";

/** The technical words of the brief and their plurals. "signature" is the one the shared wording table itself keeps (two reasons). */
const BANNED_EN = /\b(hash(es)?|JSONL|JSON|seq|payloads?|engines?|delegators?|mandates?|packets?|mint(ed|s|ing)?|bytes?|entry|entries|log ids?|chain(s|ed)?)\b/i;
const BANNED_ZH = /雜湊|紀錄鏈|位元組|引擎|委託人|JSONL?|\bseq\b|payload|hash|mandate|packet|mint/i;
const SIGNATURE = /\bsignatures?\b/i;
const CODES = ["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "SIGNATURE", "PAYLOAD_SIGNATURE", "TRUNCATED", "KEYS", "NO_DECISION", "DUPLICATE", "CONSENT", "OVERSPEND", "AFTER_REVOKE"] as const satisfies readonly VerifyFailure[];

let root: HTMLElement;
const { q, click, typeInto } = domTools(() => root);

beforeEach(() => {
  resetMode();
  root = document.createElement("div");
  document.body.replaceChildren(root);
  mountPlain(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  resetMode();
});

const checkSample = (): void => (click("demo"), click("verify"));
const changeOneReceipt = (): void => (checkSample(), click("tamper"));
const checkEmptyBoxes = (): void => click("verify");

/** Every state a person can reach with the four buttons and the boxes, as named steps. */
const STATES: readonly (readonly [string, () => void])[] = [
  ["the empty page", () => undefined],
  ["after the sample is loaded", () => click("demo")],
  ["PASS", checkSample],
  ["PASS with no saved checkpoint", () => (click("demo"), typeInto("checkpoint", ""), click("verify"))],
  ["a changed receipt (FAIL and the change note)", changeOneReceipt],
  ["the change put back", () => (click("demo"), click("tamper"), click("restore"))],
  ["NOT VERIFIED with empty boxes", checkEmptyBoxes],
  ["NOT VERIFIED with boxes that cannot be read", () => (typeInto("log", LOG), typeInto("keys", "nope"), typeInto("checkpoint", "{"), click("verify"))],
  ["NOT VERIFIED with a box that is too big", () => (typeInto("log", LOG), typeInto("keys", KEYS), typeInto("checkpoint", " ".repeat(LIMITS.smallChars + 1)), click("verify"))],
  ["a list cut short", () => (typeInto("log", joinLines(LINES.slice(0, 6))), typeInto("keys", KEYS), typeInto("checkpoint", CHECKPOINT), click("verify"))],
  ["an unreadable list", () => (typeInto("log", "hello\nworld\n"), typeInto("keys", KEYS), click("verify"))],
  ["a notice: nothing to change", () => (typeInto("log", "garbage\n"), click("tamper"))],
];

describe.each<Lang>(["en", "zh-HK"])("the words a reader sees (%s)", (lang) => {
  const banned = lang === "en" ? BANNED_EN : BANNED_ZH;

  it.each(STATES)("%s: none of the technical words", (_name, reach) => {
    reach();
    const text = visibleText(root, lang);
    expect(text.length).toBeGreaterThan(40);
    const hit = banned.exec(text);
    expect(hit?.[0], `found "${hit?.[0]}" in: ${text}`).toBeUndefined();
    expect(text.includes(String.fromCharCode(0x2014)), "an em dash on screen").toBe(false);
  });

  it("covers the header, the buttons and the honesty lines in the walk", () => {
    const text = visibleText(root, lang);
    expect(text).toContain(lang === "en" ? "Receipt checker" : "收據檢查");
    expect(text).toContain("SIMULATED");
  });
});

describe("what the closed blocks still hold, one tap away", () => {
  it("a changed receipt keeps its failure code in the closed block, and only that (the library's words are developer mode's)", () => {
    changeOneReceipt();
    const details = langText(q(".verdict details"), "en");
    expect(details).toContain("PAYLOAD_HASH");
    for (const word of ["Detail:", "seq", "Chain broken at entry 1", "entries"]) expect(details).not.toContain(word);
    expect(visibleText(q(".verdict"), "en")).not.toContain("PAYLOAD_HASH");
  });

  it("a PASS keeps the four facts in the closed block", () => {
    checkSample();
    expect(q(".verdict .more__body").querySelectorAll(".fact")).toHaveLength(4);
    expect(langText(q(".verdict .more__body"), "en")).toContain("10 (seq 0 to 9)");
    expect(visibleText(q(".verdict"), "en")).not.toContain("seq 0");
  });

  it("an empty check keeps the raw messages under the boxes, in the opened box panel, and has no disclosure on the card", () => {
    checkEmptyBoxes();
    expect(q(".verdict").querySelector("details")).toBeNull();
    expect(langText(q("#keys-error"), "en")).toContain("JSON");
    expect(langText(q(".verdict"), "en")).not.toContain("JSON");
  });

  it("the opened box panel's own labels, pills and source lines are plain too; only the boxes' messages are the boxes' own", () => {
    checkEmptyBoxes();
    const clone = q("details.inputs__more").cloneNode(true) as Element;
    for (const message of clone.querySelectorAll(".field__error")) message.remove();
    for (const lang of ["en", "zh-HK"] as const) {
      const text = langText(clone, lang);
      expect(text.length).toBeGreaterThan(30);
      expect((lang === "en" ? BANNED_EN : BANNED_ZH).exec(text)?.[0], `${lang}: ${text}`).toBeUndefined();
    }
  });

  it("the box panel's body stays out of the walk, because it is a collapsed place: only its summary is read", () => {
    checkEmptyBoxes(); // opens the panel and puts the raw messages in it
    expect(langText(q("details.inputs__more"), "en")).toContain("Paste the public keys JSON");
    expect(visibleText(root, "en")).toContain("Check your own receipts");
    expect(visibleText(root, "en")).not.toContain("Public keys file");
    expect(visibleText(root, "en")).not.toContain("Paste the public keys JSON");
  });
});

describe("each of the 14 reasons, on the card", () => {
  const base = runVerification({ log: LOG, keys: KEYS, checkpoint: "" });

  it.each(CODES)("%s reads in plain words in both languages and keeps only its code in the details", (code) => {
    if (base.kind !== "checked") throw new Error("expected a checked result");
    const report = { ok: false, failedSeq: 3, reason: code, detail: "the library's own words about seq 3 and a hash" } as const;
    const node = renderPlainResult({ ...base, report });
    expect(node.getAttribute("data-reason")).toBe(code);
    expect(node.getAttribute("data-failed-seq")).toBe("3");
    for (const lang of ["en", "zh-HK"] as const) {
      const text = visibleText(node, lang);
      if (lang === "en") {
        const without = text.replace(SIGNATURE, "");
        expect(BANNED_EN.exec(without)?.[0], `${code}: ${text}`).toBeUndefined();
        expect(SIGNATURE.test(text), code).toBe(code === "SIGNATURE" || code === "PAYLOAD_SIGNATURE");
      } else {
        expect(BANNED_ZH.exec(text)?.[0], `${code}: ${text}`).toBeUndefined();
      }
      expect(text).not.toContain(code);
    }
    expect(langText(node.querySelector(".more__body") as Element, "en")).toBe(`Code${code}`);
    expect(node.textContent).not.toContain("the library's own words");
  });
});
