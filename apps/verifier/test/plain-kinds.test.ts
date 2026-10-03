// No internal entry kind in plain mode, anywhere in the DOM text: not in the receipts list, the verdict, the change note,
// the closed "Show the details" blocks or the closed box panel. The walk reads document.body.textContent, so closed
// disclosures count (unlike plain-words.test.ts, which reads what is visible). Developer mode still shows the kinds where it
// always did: the receipts list's kind column, the Detail line, the change note's "(DECISION)".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPlainResult } from "../src/render/plain-result";
import { renderResult } from "../src/render/result";
import { runVerification } from "../src/run";
import { CHECKPOINT, domTools, joinLines, KEYS, LINES, LOG, langText, mountDeveloper, mountPlain, resetMode, type Lang } from "./helpers";

const KINDS = ["MANDATE_SEALED", "MANDATE_REVOKED", "DECISION", "CARD_MINTED", "CARD_EVENT", "PACKET_EXPIRED"] as const;
/** Any appearance, in any case, inside any longer word (log_DECISION, MANDATE_SEALED1 count). */
const KIND = new RegExp(KINDS.join("|"), "i");
/** NO_DECISION is a failure code of the verifier, shown on purpose in the details of that failure; it is not an entry kind. */
const withoutCodes = (text: string): string => text.replaceAll("NO_DECISION", "");
const hasKind = (text: string): boolean => KIND.test(withoutCodes(text));

let root: HTMLElement;
const { q, qa, click, typeInto } = domTools(() => root);

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  resetMode();
});

/** One entry as a canonical line (keys in order, no spaces), so the page reads its parts instead of calling it unreadable. */
const line = (entry: Record<string, unknown>): string => `${JSON.stringify(Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : 1))))}\n`;

function expectNoKind(): void {
  const all = withoutCodes(document.body.textContent ?? "");
  expect(KIND.exec(all)?.[0], `in: ${all.slice(0, 300)}`).toBeUndefined();
  for (const lang of ["en", "zh-HK"] as const satisfies readonly Lang[]) {
    const one = withoutCodes(langText(document.body, lang));
    expect(KIND.exec(one)?.[0], `${lang} in: ${one.slice(0, 300)}`).toBeUndefined();
  }
}

describe("plain mode never shows an entry kind, closed blocks included", () => {
  beforeEach(() => {
    resetMode();
    root = document.createElement("div");
    document.body.replaceChildren(root);
    mountPlain(root);
  });

  const STATES: readonly (readonly [string, () => void])[] = [
    ["idle", () => undefined],
    ["the sample loaded", () => click("demo")],
    ["PASS", () => (click("demo"), click("verify"))],
    ["PASS with no saved checkpoint", () => (click("demo"), typeInto("checkpoint", ""), click("verify"))],
    ["FAIL after changing a receipt", () => (click("demo"), click("verify"), click("tamper"))],
    ["restored", () => (click("demo"), click("verify"), click("tamper"), click("restore"))],
    ["NOT VERIFIED with empty boxes", () => click("verify")],
    ["NOT VERIFIED with boxes that cannot be read", () => (typeInto("log", LOG), typeInto("keys", "nope"), typeInto("checkpoint", "{"), click("verify"))],
    ["a list cut short", () => (typeInto("log", joinLines(LINES.slice(0, 6))), typeInto("keys", KEYS), typeInto("checkpoint", CHECKPOINT), click("verify"))],
    ["a list that is not readable", () => (typeInto("log", "hello\nworld\n"), typeInto("keys", KEYS), click("verify"))],
    ["a list that starts with the wrong kind of receipt", () => (typeInto("log", joinLines(LINES.slice(1))), typeInto("keys", KEYS), click("verify"))],
    ["a notice", () => (typeInto("log", "garbage\n"), click("tamper"))],
  ];

  it.each(STATES)("%s", (_name, reach) => {
    reach();
    expect(document.body.textContent?.length).toBeGreaterThan(100);
    expectNoKind();
  });

  it("a receipt whose kind is not one it knows is called a receipt, and the kind is not printed", () => {
    typeInto("log", line({ kind: "SOMETHING_NEW", payload: {}, seq: 0, ts: "2026-10-03T02:00:01.000Z" }));
    typeInto("keys", KEYS);
    click("verify");
    expect(qa(".timeline .row")).toHaveLength(1);
    expect(langText(q(".timeline .row"), "en")).toContain("A receipt");
    expect(document.body.textContent).not.toContain("SOMETHING_NEW");
    expectNoKind();
  });

  it("a known kind with nothing readable inside it is called a receipt too", () => {
    typeInto("log", line({ kind: "DECISION", payload: {}, seq: 0, ts: "2026-10-03T02:00:01.000Z" }));
    typeInto("keys", KEYS);
    click("verify");
    expect(qa(".timeline .row")).toHaveLength(1);
    expect(langText(q(".timeline .row"), "en")).toContain("A receipt");
    expectNoKind();
  });

  it("a value that looks like a kind in a time or an outcome is not printed either", () => {
    typeInto("log", line({ kind: "MANDATE_REVOKED", payload: { outcome: "MANDATE_SEALED" }, seq: 0, ts: "CARD_EVENT" }));
    typeInto("keys", KEYS);
    click("verify");
    expect(qa(".timeline .row")).toHaveLength(1);
    expect(langText(q(".timeline .row"), "en")).toContain("Time not readable");
    expectNoKind();
  });

  it("an HTML-looking or oversized kind is neither printed nor turned into markup", () => {
    typeInto("log", line({ kind: `<b>${"K".repeat(500)}</b>`, payload: {}, seq: 0, ts: "2026-10-03T02:00:01.000Z" }));
    typeInto("keys", KEYS);
    click("verify");
    expect(root.querySelector("b")).toBeNull();
    expect(document.body.textContent).not.toContain("KKKK");
  });

  it("a library detail that names a kind is not on the page, in the verdict or in its closed block", () => {
    const base = runVerification({ log: LOG, keys: KEYS, checkpoint: "" });
    if (base.kind !== "checked") throw new Error("expected a checked result");
    for (const kind of KINDS) {
      const report = { ok: false, failedSeq: 0, reason: "SCHEMA", detail: `seq 0 must be ${kind}` } as const;
      const node = renderPlainResult({ ...base, report });
      expect(node.textContent, kind).not.toContain(kind);
      expect(node.textContent, kind).not.toContain("must be");
      expect(langText(node.querySelector(".more__body") as Element, "en")).toBe("CodeSCHEMA");
    }
  });

  it("an error message that names a kind is not on the page either", () => {
    for (const kind of KINDS) {
      const node = renderPlainResult({ kind: "crashed", message: `could not read a ${kind}` });
      expect(node.textContent, kind).not.toContain(kind);
      expect(node.textContent, kind).not.toContain("could not read");
    }
  });

  it("the change note names the change in words, never the kind or the field path", () => {
    click("demo");
    click("verify");
    click("tamper");
    const note = q(".tamper-note");
    expect(note.textContent).not.toMatch(/DECISION|payload|approved_limit_minor|_minor/);
    expect(note.getAttributeNames().filter((name) => name.startsWith("data-"))).toEqual(["data-tampered", "data-tampered-seq"]);
  });

  it("the source lines of the closed box panel say where the text came from, not what is in it", () => {
    click("demo");
    typeInto("keys", "x");
    for (const field of ["log", "keys", "checkpoint"]) expect(q(`#${field}-source`).textContent).not.toMatch(KIND);
    expectNoKind();
  });

  it("flipping a FAIL from developer to plain takes every kind off the page, and the state is the same", () => {
    click("demo");
    click("verify");
    click("tamper");
    expectNoKind();
    q<HTMLButtonElement>('[role="switch"]').click(); // developer: the same result, with its kinds
    expect(hasKind(document.body.textContent ?? "")).toBe(true);
    expect(q("[data-outcome]").getAttribute("data-failed-seq")).toBe("1");
    q<HTMLButtonElement>('[role="switch"]').click(); // and back to plain
    expectNoKind();
    expect(q("[data-outcome]").getAttribute("data-failed-seq")).toBe("1");
  });
});

describe("developer mode still shows them where it always did", () => {
  beforeEach(() => {
    resetMode();
    root = document.createElement("div");
    document.body.replaceChildren(root);
    mountDeveloper(root);
  });

  it("the receipts list has the kind column, one kind per row, in log order", () => {
    click("demo");
    click("verify");
    expect(qa(".timeline .row .row__kind").map((cell) => cell.textContent)).toEqual([
      "MANDATE_SEALED",
      "DECISION",
      "CARD_MINTED",
      "CARD_EVENT",
      "CARD_EVENT",
      "DECISION",
      "DECISION",
      "DECISION",
      "MANDATE_REVOKED",
      "PACKET_EXPIRED",
    ]);
  });

  it("a FAIL keeps the Detail line with the library's sentence, and the change note keeps the kind and the field path", () => {
    click("demo");
    click("verify");
    click("tamper");
    const detail = q(".verdict__detail");
    expect(detail.textContent?.startsWith("Detail: ")).toBe(true);
    expect((detail.textContent ?? "").length).toBeGreaterThan("Detail: ".length + 5);
    expect(q(".tamper-note").textContent).toContain("(DECISION)");
    expect(q(".tamper-note").textContent).toContain("payload.approved_limit_minor");
  });

  it("a library detail that names a kind is shown on the developer card, exactly as today", () => {
    const base = runVerification({ log: LOG, keys: KEYS, checkpoint: "" });
    if (base.kind !== "checked") throw new Error("expected a checked result");
    const report = { ok: false, failedSeq: 0, reason: "SCHEMA", detail: "seq 0 must be MANDATE_SEALED" } as const;
    const node = renderResult({ ...base, report });
    expect(langText(node.querySelector(".verdict__detail") as Element, "en")).toBe("Detail: seq 0 must be MANDATE_SEALED");
  });

  it("an error message is shown on the developer card, exactly as today", () => {
    expect(renderResult({ kind: "crashed", message: "could not read a CARD_EVENT" }).textContent).toContain("could not read a CARD_EVENT");
  });
});
