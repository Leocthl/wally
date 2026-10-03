// Plain mode, the other ways a list can fail: a break in the first receipt, a list cut short, a receipt rewritten where the
// checkpoint points, an unreadable list, and the big word and the line under it for each of the 14 failure codes. The
// judge flow itself (sample, check, change one receipt, put it back) is in plain-page.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKPOINT, domTools, joinLines, KEYS, langText, LINES, LOG, mountPlain, resetMode } from "./helpers";

let root: HTMLElement;
const { q, qa, click, typeInto } = domTools(() => root);
const en = (selector: string): string => langText(q(selector), "en");
const zh = (selector: string): string => langText(q(selector), "zh-HK");
const rowsEn = (): readonly string[] => qa(".timeline .row").map((row) => langText(row, "en"));

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

describe("other ways a list can fail", () => {
  const checkLog = (log: string, checkpoint = CHECKPOINT): void => {
    typeInto("log", log);
    typeInto("keys", KEYS);
    typeInto("checkpoint", checkpoint);
    click("verify");
  };

  it("a break in the first receipt says there is nothing earlier to rely on", () => {
    checkLog(LOG.replace('"payload_hash":"da24a6c8', '"payload_hash":"db24a6c8'));
    expect(q("[data-outcome]").getAttribute("data-failed-seq")).toBe("0");
    expect(langText(q(".verdict__word"), "en")).toBe("Changed at receipt 1");
    expect(en(".verdict__tail")).toBe("This is the first receipt, so there is nothing earlier to rely on. Receipts after it were not checked, because one change breaks the rest.");
    expect(zh(".verdict__tail")).toContain("這是第一張收據");
  });

  it("a list cut short does not say a receipt changed: it says the list does not match the saved checkpoint", () => {
    checkLog(joinLines(LINES.slice(0, 6)));
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-reason")).toBe("TRUNCATED");
    expect(verdict.getAttribute("data-failed-seq")).toBe("6");
    expect(langText(q(".verdict__word"), "en")).toBe("Does not match the saved checkpoint");
    expect(en(".verdict__lede")).toBe("Receipts are missing from the end, or were rewritten: the list does not match the saved checkpoint.");
    expect(en(".verdict__tail")).toBe("The receipts that are here are untouched.");
    expect(qa(".timeline .row").every((r) => r.getAttribute("data-status") === "ok")).toBe(true);
    expect(q(".row--checkpoint").getAttribute("data-checkpoint")).toBe("broken");
    expect(langText(q(".row--checkpoint"), "en")).toBe("The saved checkpoint does not match: receipts were cut off the end or rewritten.");
  });

  it("a receipt rewritten where the checkpoint points is shown as changed there", () => {
    const at4 = JSON.parse(LINES[4] ?? "{}") as { entry_hash: string };
    checkLog(LOG, JSON.stringify({ log_id: "log_demoM0", seq: 3, entry_hash: at4.entry_hash }));
    expect(q("[data-outcome]").getAttribute("data-reason")).toBe("TRUNCATED");
    expect(langText(q(".verdict__word"), "en")).toBe("Changed at receipt 4");
    expect(qa(".timeline .row").map((r) => r.getAttribute("data-status")).slice(0, 5)).toEqual(["ok", "ok", "ok", "broken", "unchecked"]);
  });

  it("keys that cannot anchor trust say nothing was checked (the keys box refuses them first, so this drives the card directly)", async () => {
    const { renderPlainResult } = await import("../src/render/plain-result");
    const { runVerification } = await import("../src/run");
    const base = runVerification({ log: LOG, keys: KEYS, checkpoint: "" });
    if (base.kind !== "checked") throw new Error("expected a checked result");
    const report = { ok: false, failedSeq: 0, reason: "KEYS", detail: "no delegator did:key is pinned" } as const;
    const node = renderPlainResult({ ...base, report });
    expect(node.getAttribute("data-reason")).toBe("KEYS");
    expect(langText(node.querySelector(".verdict__word") as Element, "en")).toBe("Nothing was checked");
    expect(langText(node.querySelector(".verdict__lede") as Element, "en")).toBe("The keys given cannot be trusted, so nothing was checked.");
    expect(node.querySelector(".verdict__tail")).toBeNull();
    expect(langText(node.querySelector(".more__body") as Element, "en")).toBe("CodeKEYS");
    expect(node.textContent).not.toContain("no delegator did:key is pinned");
  });

  it("an unreadable list still names a receipt, and the library's words about it are nowhere in the page, not even in the closed block", () => {
    checkLog("hello\nworld\n");
    expect(q("[data-outcome]").getAttribute("data-reason")).toBe("SCHEMA");
    expect(langText(q(".verdict__word"), "en")).toBe("Changed at receipt 1");
    expect(en(".verdict__lede")).toBe("This receipt is not written the way Wally writes them, or is in the wrong place.");
    expect(langText(q(".verdict .more__body"), "en")).toBe("CodeSCHEMA");
    expect(document.body.textContent).not.toContain("not JSON");
    expect(rowsEn()[0]).toContain("A receipt");
  });
});

describe("the big word for each of the 14 failure codes", () => {
  const RULE_BREAKS = ["NO_DECISION", "DUPLICATE", "CONSENT", "OVERSPEND", "AFTER_REVOKE"] as const;
  const CHANGED = ["SCHEMA", "SEQ", "PREV_HASH", "PAYLOAD_HASH", "ENTRY_HASH", "SIGNATURE", "PAYLOAD_SIGNATURE"] as const;

  async function card(reason: string, failedSeq: number): Promise<Element> {
    const { renderPlainResult } = await import("../src/render/plain-result");
    const { runVerification } = await import("../src/run");
    const base = runVerification({ log: LOG, keys: KEYS, checkpoint: "" });
    if (base.kind !== "checked") throw new Error("expected a checked result");
    return renderPlainResult({ ...base, report: { ok: false, failedSeq, reason, detail: "x" } as never });
  }
  const word = (node: Element, lang: "en" | "zh-HK"): string => langText(node.querySelector(".verdict__word") as Element, lang);
  const tail = (node: Element, lang: "en" | "zh-HK"): string | null => (node.querySelector(".verdict__tail") === null ? null : langText(node.querySelector(".verdict__tail") as Element, lang));

  it.each(CHANGED)("%s: a receipt that was altered reads 'Changed at receipt N'", async (code) => {
    const node = await card(code, 3);
    expect(word(node, "en")).toBe("Changed at receipt 4");
    expect(word(node, "zh-HK")).toBe("第 4 張收據被改動");
    expect(tail(node, "en")).toBe("Receipts before it are untouched. Receipts after it were not checked, because one change breaks the rest.");
  });

  it.each(RULE_BREAKS)("%s: a broken rule reads 'Problem at receipt N', never 'changed'", async (code) => {
    const node = await card(code, 3);
    expect(word(node, "en")).toBe("Problem at receipt 4");
    expect(word(node, "zh-HK")).toBe("第 4 張收據有問題");
    expect(tail(node, "en")).toBe("Receipts before it passed. Receipts after it were not checked.");
    expect(tail(node, "zh-HK")).toBe("它之前的收據已通過檢查；之後的收據不會再檢查。");
    expect(langText(node, "en")).not.toMatch(/[Cc]hanged|one change/);
    expect(langText(node, "zh-HK")).not.toMatch(/被改動|一處改動/);
  });

  it("a broken rule at the first receipt says there is nothing earlier to rely on", async () => {
    const node = await card("AFTER_REVOKE", 0);
    expect(word(node, "en")).toBe("Problem at receipt 1");
    expect(tail(node, "en")).toBe("This is the first receipt, so there is nothing earlier to rely on. Receipts after it were not checked.");
  });

  it("TRUNCATED with every receipt intact says the list does not match the saved checkpoint", async () => {
    const node = await card("TRUNCATED", 3);
    expect(word(node, "en")).toBe("Does not match the saved checkpoint");
    expect(tail(node, "en")).toBe("The receipts that are here are untouched.");
  });

  it("KEYS says nothing was checked, with no 'before and after' line", async () => {
    const node = await card("KEYS", 0);
    expect(word(node, "en")).toBe("Nothing was checked");
    expect(tail(node, "en")).toBeNull();
  });
});
