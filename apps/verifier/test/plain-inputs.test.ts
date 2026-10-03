// Plain mode, the boxes and the odd cases: what NOT VERIFIED says, the folded "Check your own receipts" panel and where it
// opens, notices in plain words, hostile lines from a list, and a long list. The verdict, receipts and change note are in
// plain-page.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifierPage } from "../src/app";
import { LIMITS } from "../src/limits";
import { domTools, KEYS, langText, LOG, mountPlain, resetMode } from "./helpers";

let root: HTMLElement;
let page: VerifierPage;
const { q, qa, click, typeInto } = domTools(() => root);
const en = (selector: string): string => langText(q(selector), "en");
const zh = (selector: string): string => langText(q(selector), "zh-HK");
const rowsEn = (): readonly string[] => qa(".timeline .row").map((row) => langText(row, "en"));

async function chooseFile(field: string, file: File): Promise<void> {
  const input = q<HTMLInputElement>(`#${field}-file`);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(page.state().notice !== null || page.state()[field as "log"].source.startsWith("file:")).toBe(true));
}

beforeEach(() => {
  resetMode();
  root = document.createElement("div");
  document.body.replaceChildren(root);
  page = mountPlain(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  resetMode();
});

describe("NOT VERIFIED", () => {
  it("names each box that could not be used in plain words, with no disclosure on the card", () => {
    click("verify");
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-outcome")).toBe("input-error");
    expect(langText(q(".verdict__word"), "en")).toBe("NOT VERIFIED");
    const items = qa(".verdict > .verdict__list > li").map((li) => langText(li, "en"));
    expect(items).toEqual(["Receipts file: There are no receipts to check yet.", "Public keys: There are no public keys yet."]);
    const zhItems = qa(".verdict > .verdict__list > li").map((li) => langText(li, "zh-HK"));
    expect(zhItems).toEqual(["收據檔案：還未有收據可供檢查。", "公鑰：還未有公鑰。"]);
    expect(verdict.querySelector("details")).toBeNull();
    expect(langText(verdict, "en")).not.toMatch(/JSON|Paste/);
  });

  it("keeps each box's own message under the box, in the panel the error opens", () => {
    click("verify");
    expect(q<HTMLDetailsElement>("details.inputs__more").open).toBe(true);
    expect(langText(q("#log-error"), "en")).toBe("No receipts yet. Paste receipts or load a file.");
    expect(langText(q("#keys-error"), "en")).toBe("No public keys yet. Paste the public keys JSON or load the file.");
    expect(q<HTMLElement>("#checkpoint-error").hidden).toBe(true);
  });

  it("says a box that is not readable could not be read, and one that is too big is too big", () => {
    typeInto("log", LOG);
    typeInto("keys", "not json");
    typeInto("checkpoint", " ".repeat(LIMITS.smallChars + 1));
    click("verify");
    const items = qa(".verdict > .verdict__list > li").map((li) => langText(li, "en"));
    expect(items).toEqual(["Public keys: Could not be read.", "Saved checkpoint: Too big for this page."]);
    expect(langText(q("#keys-error"), "en")).toContain("is not valid JSON");
    expect(langText(q("#checkpoint-error"), "en")).toContain("65,537 characters");
  });

  it("opens the box panel when a box has an error, and shows the raw message there", () => {
    const panel = q<HTMLDetailsElement>("details.inputs__more");
    expect(panel.open).toBe(false);
    click("verify");
    expect(panel.open).toBe(true);
    expect(q<HTMLElement>("#log-error").hidden).toBe(false);
    expect(q("#keys-text").getAttribute("aria-invalid")).toBe("true");
    expect(langText(q("#log-error"), "en")).toBe("No receipts yet. Paste receipts or load a file.");
  });

  it("shows a stopped check in plain words only: the error's own message (it may quote a log line) is developer mode's", async () => {
    const { renderPlainResult } = await import("../src/render/plain-result");
    const node = renderPlainResult({ kind: "crashed", message: "the engine fell over while reading CARD_EVENT" });
    expect(node.getAttribute("data-outcome")).toBe("crashed");
    expect(langText(node.querySelector(".verdict__word") as Element, "en")).toBe("NOT VERIFIED");
    expect(langText(node.querySelector(".verdict__lede") as Element, "en")).toBe("The check could not finish. Treat these receipts as not checked.");
    expect(langText(node.querySelector(".verdict__lede") as Element, "zh-HK")).toBe("檢查未能完成。請當作這些收據未經檢查。");
    expect(node.querySelector("details")).toBeNull();
    expect(node.textContent).not.toContain("fell over");
    expect(node.textContent).not.toContain("CARD_EVENT");
  });
});

describe("the box panel", () => {
  it("is one closed block named 'Check your own receipts', holding the three boxes", () => {
    const panel = q<HTMLDetailsElement>("details.inputs__more");
    expect(panel.open).toBe(false);
    expect(langText(q("details.inputs__more > summary"), "en")).toBe("Check your own receipts");
    expect(langText(q("details.inputs__more > summary"), "zh-HK")).toBe("檢查你自己的收據");
    expect(q("section.inputs").getAttribute("aria-labelledby")).toBe("inputs-title");
    expect(q("#inputs-title").tagName).toBe("SUMMARY");
    expect(qa("details.inputs__more textarea")).toHaveLength(3);
    expect(qa("details.inputs__more input[type=file]")).toHaveLength(3);
  });

  it("labels the boxes in plain words", () => {
    expect(en('label[for="log-text"]')).toBe("Receipts file");
    expect(en('label[for="keys-text"]')).toBe("Public keys file");
    expect(en('label[for="checkpoint-text"]')).toBe("Saved checkpoint (optional)");
    expect(zh('label[for="log-text"]')).toBe("收據檔案");
    expect(zh('label[for="checkpoint-text"]')).toBe("已儲存的檢查點（選填）");
  });

  it("says where each box's content came from in plain words", () => {
    expect(en("#log-source")).toBe("Empty.");
    click("demo");
    expect(en("#log-source")).toBe("Sample receipts for practice (SIMULATED).");
    expect(en("#keys-source")).toBe("Sample public keys for practice (SIMULATED).");
    expect(en("#checkpoint-source")).toBe("Sample checkpoint for practice (SIMULATED).");
    click("tamper");
    expect(en("#log-source")).toBe("A changed copy. One digit differs from the original.");
    expect(zh("#log-source")).toBe("已改動的副本，與原文只有一個數字不同。");
    click("restore");
    expect(en("#log-source")).toBe("Sample receipts for practice (SIMULATED).");
    typeInto("log", `${LOG} `);
    expect(en("#log-source")).toBe("You pasted or typed this.");
    expect(zh("#log-source")).toBe("這是你貼上或輸入的內容。");
  });

  it("names a loaded file", async () => {
    await chooseFile("log", new File([LOG], "my-receipts.jsonl", { type: "text/plain" }));
    expect(en("#log-source")).toBe("Loaded from file my-receipts.jsonl.");
    expect(zh("#log-source")).toBe("由檔案 my-receipts.jsonl 載入。");
  });

  it("stays closed when a sample is loaded or a receipt is changed", () => {
    const panel = q<HTMLDetailsElement>("details.inputs__more");
    click("demo");
    click("verify");
    click("tamper");
    expect(panel.open).toBe(false);
  });

  it("is not reopened by later changes once the reader has closed it", () => {
    const panel = q<HTMLDetailsElement>("details.inputs__more");
    click("verify");
    expect(panel.open).toBe(true);
    panel.open = false;
    typeInto("log", "x");
    expect(panel.open).toBe(false);
  });
});

describe("notices", () => {
  it("says there is nothing to change in plain words", () => {
    typeInto("log", "garbage\n");
    click("tamper");
    expect(en(".notice")).toBe("There is nothing to change here: no receipt with an amount or a time.");
    expect(zh(".notice")).toBe("此處沒有可改動的內容：找不到含金額或時間的收據。");
  });

  it("says a file is too big without bytes", async () => {
    await chooseFile("keys", new File(["x".repeat(LIMITS.smallChars + 1)], "big.json"));
    expect(en(".notice")).toContain("The file big.json is too big for this page");
    expect(en(".notice")).toContain(LIMITS.smallChars.toLocaleString("en"));
    expect(en(".notice")).not.toMatch(/bytes?/i);
  });
});

describe("hostile text from a list", () => {
  it("never becomes markup in a row, the verdict or the note", () => {
    const evil = '<img src=x onerror="globalThis.__pwned=1">';
    typeInto("log", `${JSON.stringify({ kind: evil, seq: 0, ts: evil })}\n`);
    typeInto("keys", KEYS);
    click("verify");
    expect(root.querySelector("img")).toBeNull();
    expect((globalThis as Record<string, unknown>)["__pwned"]).toBeUndefined();
    expect(rowsEn()[0]).toContain("A receipt");
    expect(rowsEn()[0]).toContain("Time not readable");
    expect(document.body.textContent).not.toContain("onerror");
    expect(document.body.textContent).not.toContain("<img");
  });

  it("says an odd time is not readable instead of quoting it, and calls an odd kind a receipt (a canonical line, so its parts are read)", () => {
    typeInto("log", '{"kind":"__proto__","payload":{"outcome":"APPROVE"},"seq":0,"ts":"not a time"}\n');
    typeInto("keys", KEYS);
    click("verify");
    expect(rowsEn()).toEqual(["Receipt 1A receiptTime not readablechanged"]);
    expect(langText(q(".timeline .row .row__ts"), "zh-HK")).toBe("時間無法讀取");
    expect(document.body.textContent).not.toContain("not a time");
  });

  it("never prints a log value that looks like a kind, wherever it hides in a line", () => {
    typeInto("log", '{"kind":"MANDATE_REVOKED","payload":{"outcome":"MANDATE_SEALED"},"seq":0,"ts":"CARD_EVENT"}\n');
    typeInto("keys", KEYS);
    click("verify");
    expect(qa(".timeline .row")).toHaveLength(1);
    expect(rowsEn()[0]).toContain("Time not readable");
    expect(document.body.textContent).not.toMatch(/MANDATE|CARD_EVENT/);
  });

  it("shows a line that is not canonical JSON as an unreadable receipt, with no time", () => {
    typeInto("log", `${JSON.stringify({ ts: "2026-10-03T02:00:01.000Z", kind: "DECISION", seq: 0 })}\n`);
    typeInto("keys", KEYS);
    click("verify");
    expect(rowsEn()[0]).toBe("Receipt 1A receiptchanged");
  });
});

describe("a long list", () => {
  it("shows a window around the first failure and says how many receipts are not shown, in plain words", async () => {
    const { renderPlainTimeline } = await import("../src/render/plain-timeline");
    const { runVerification } = await import("../src/run");
    const base = runVerification({ log: LOG, keys: KEYS, checkpoint: "" });
    if (base.kind !== "checked") throw new Error("expected a checked result");
    const rows = Array.from({ length: 1000 }, (_, i) => ({ index: i, seq: String(i), kind: "DECISION", ts: "", status: i < 500 ? "ok" : i === 500 ? "broken" : "unchecked", event: "approved" }) as const);
    const node = renderPlainTimeline({ ...base, timeline: { rows, checkpoint: "none" } }, null);
    expect(node.querySelectorAll(".row")).toHaveLength(400);
    expect(node.querySelector('.row[data-index="500"]')?.getAttribute("data-status")).toBe("broken");
    expect([...node.querySelectorAll(".gap")].map((gap) => langText(gap, "en"))).toEqual(["300 earlier receipts not shown.", "300 later receipts not shown."]);
    expect([...node.querySelectorAll(".gap")].map((gap) => langText(gap, "zh-HK"))).toEqual(["較早的 300 張收據未有顯示。", "較後的 300 張收據未有顯示。"]);
    expect(langText(node.querySelector('.row[data-index="500"] .row__seq') as Element, "en")).toBe("Receipt 501");
  });
});
