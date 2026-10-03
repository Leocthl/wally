// Plain Proof words: the pure functions behind the plain Proof and Receipts screens. One label for every kind of log
// entry (kind, outcome, resolves, escalation state, template, card event), receipts numbered from 1, the 14 plain
// reasons with a safe fallback, the tampered field in words, which row is untouched, changed or not checked, and the
// string table itself: EN and zh-HK for every line, the same placeholders, no banned word, no em dash, no emoji.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeClock } from "@wally/core/testing";
import { describe, expect, it } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import type { LogEntry } from "../src/api/types";
import { m0Request } from "../src/booth/compile";
import { PLAIN } from "../src/screens/proof/plainStrings";
import { eventKey, eventWords, plainFieldWords, plainReasonWords, receiptNumber, rowStatuses, signedByYou, type EventKey } from "../src/screens/proof/plainWords";

type Step = Parameters<MockApiClient["runScenario"]>[0] | "REVOKE";

async function logAfter(...steps: Step[]): Promise<readonly LogEntry[]> {
  const clock = new FakeClock();
  const api = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
  await api.seal(m0Request(clock.now()));
  for (const step of steps) {
    if (step === "REVOKE") await api.revoke();
    else await api.runScenario(step);
  }
  return (await api.getLog()).entries;
}

const find = (entries: readonly LogEntry[], pick: (e: LogEntry) => boolean): LogEntry => {
  const found = entries.find(pick);
  if (!found) throw new Error("fixture entry missing");
  return found;
};
type Decision = Extract<LogEntry, { kind: "DECISION" }>;
type CardEvent = Extract<LogEntry, { kind: "CARD_EVENT" }>;
const decisionOf = (e: LogEntry): Decision => {
  if (e.kind !== "DECISION") throw new Error("decision expected");
  return e;
};
/** A copy of a decision entry with some payload fields replaced (the input is never changed). */
const withDecision = (e: LogEntry, patch: Record<string, unknown>): LogEntry => ({ ...decisionOf(e), payload: { ...decisionOf(e).payload, ...patch } }) as LogEntry;
const withCardEvent = (e: LogEntry, event: CardEvent["payload"]["event"]): LogEntry => {
  if (e.kind !== "CARD_EVENT") throw new Error("card event expected");
  return { ...e, payload: { ...e.payload, event } };
};
const ESCALATION = { expires_at: "2026-10-03T02:10:00Z" } as const;

describe("event labels", () => {
  it("names every kind of receipt in the shared words, in both languages", async () => {
    const entries = await logAfter("normal", "flagged", "unverified", "overshoot", "REVOKE");
    const sealed = entries[0]!;
    const approved = find(entries, (e) => e.kind === "DECISION" && e.payload.outcome === "APPROVE");
    const stopped = find(entries, (e) => e.kind === "DECISION" && e.payload.outcome === "DENY");
    const asked = find(entries, (e) => e.kind === "DECISION" && e.payload.outcome === "ESCALATE");
    const minted = find(entries, (e) => e.kind === "CARD_MINTED");
    const charged = find(entries, (e) => e.kind === "CARD_EVENT" && e.payload.event === "AUTHORISED");
    const declined = find(entries, (e) => e.kind === "CARD_EVENT" && e.payload.event === "DECLINED");
    const voided = find(entries, (e) => e.kind === "CARD_EVENT" && e.payload.event === "VOIDED");
    const revoked = find(entries, (e) => e.kind === "MANDATE_REVOKED");
    const cases: readonly (readonly [string, LogEntry, EventKey, string, string])[] = [
      ["MANDATE_SEALED", sealed, "sealed", "Budget sealed", "預算已鎖定"],
      ["DECISION APPROVE", approved, "approved", "Approved", "已批准"],
      ["DECISION APPROVE resolving an escalation", withDecision(approved, { resolves: "dec_ask000001" }), "youSaidYes", "You said yes", "你已批准"],
      ["DECISION DENY", stopped, "stopped", "Stopped before paying", "付款前已攔截"],
      ["DECISION DENY resolving, escalation DENIED", withDecision(stopped, { resolves: "dec_ask000001", escalation: { state: "DENIED", ...ESCALATION } }), "youSaidNo", "You said no", "你已拒絕"],
      ["DECISION DENY resolving, escalation EXPIRED", withDecision(stopped, { resolves: "dec_ask000001", escalation: { state: "EXPIRED", ...ESCALATION } }), "noAnswer", "No answer in time", "未有及時回覆"],
      ["DECISION DENY resolving, template R11.expired", withDecision(stopped, { resolves: "dec_ask000001", explanation: { template_id: "R11.expired", inputs: {}, rendered: "x" } }), "noAnswer", "No answer in time", "未有及時回覆"],
      ["DECISION DENY resolving, template R12.price_drift", withDecision(stopped, { resolves: "dec_app000001", explanation: { template_id: "R12.price_drift", inputs: {}, rendered: "x" } }), "priceChanged", "Price changed at checkout", "結帳時價格有變"],
      ["DECISION ESCALATE", asked, "asked", "Wally asked for your OK", "Wally 請你確認"],
      ["CARD_MINTED", minted, "cardMade", "One-off card made", "已發出一次性卡"],
      ["CARD_EVENT AUTHORISED", charged, "charged", "Charged", "已扣款"],
      ["CARD_EVENT DECLINED", declined, "declined", "Charge declined", "扣款被拒"],
      ["CARD_EVENT VOIDED", voided, "voided", "Card cancelled", "卡已取消"],
      ["CARD_EVENT EXPIRED", withCardEvent(voided, "EXPIRED"), "cardExpired", "Card expired", "卡已過期"],
      ["MANDATE_REVOKED", revoked, "revoked", "You cancelled the budget", "你已取消預算"],
      ["PACKET_EXPIRED", { ...sealed, kind: "PACKET_EXPIRED", payload: { expired_at: "2026-10-31T16:00:00Z" } } as unknown as LogEntry, "ended", "Budget ended", "預算已完結"],
    ];
    for (const [name, entry, key, en, zh] of cases) {
      expect(eventKey(entry), name).toBe(key);
      expect(eventWords(entry), name).toEqual({ en, zh });
    }
    // Every label in the table is reached by at least one case, so none is dead.
    const reached = new Set(cases.map(([, , key]) => key));
    expect([...reached, "other"].sort()).toEqual(Object.keys(PLAIN.events).sort());
  });

  it("lets the person's own answer win over the template: a no is a no even though it cites R11", async () => {
    const stopped = find(await logAfter("flagged"), (e) => e.kind === "DECISION");
    const denied = withDecision(stopped, {
      resolves: "dec_ask000001",
      escalation: { state: "DENIED", ...ESCALATION },
      explanation: { template_id: "R11.expired", inputs: { choice: "DENY" }, rendered: "x" },
    });
    expect(eventKey(denied)).toBe("youSaidNo");
  });

  it("labels a stop that resolves something for another reason (a revoked budget at checkout) as a stop", async () => {
    const stopped = find(await logAfter("flagged"), (e) => e.kind === "DECISION");
    const atCheckout = withDecision(stopped, { resolves: "dec_app000001", explanation: { template_id: "R2.revoked", inputs: {}, rendered: "x" } });
    expect(eventKey(atCheckout)).toBe("stopped");
  });

  it("reads real answered, expired and drifting receipts the way the shared words say", async () => {
    const clock = new FakeClock();
    const api = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
    await api.seal(m0Request(clock.now()));
    await api.runScenario("unverified");
    const open = (await api.snapshot()).escalations[0]!;
    await api.answerEscalation({ decisionId: open.decisionId, choice: "APPROVE" });
    await api.runScenario("unverified");
    const second = (await api.snapshot()).escalations.find((e) => e.state === "OPEN")!;
    await api.answerEscalation({ decisionId: second.decisionId, choice: "DENY" });
    await api.runScenario("unverified");
    clock.advance(61_000);
    await api.sweepEscalations();
    await api.runScenario("drift");
    const keys = (await api.getLog()).entries.filter((e) => e.kind === "DECISION").map(eventKey);
    expect(keys).toEqual(["asked", "youSaidYes", "asked", "youSaidNo", "asked", "noAnswer", "approved", "priceChanged"]);
  });

  it("never throws on an entry it cannot read: it is just a receipt", () => {
    for (const bad of [null, undefined, 7, "x", {}, { kind: "WHAT" }, { kind: "DECISION" }, { kind: "DECISION", payload: null }, { kind: "CARD_EVENT", payload: { event: "SOMETHING" } }]) {
      expect(eventKey(bad as unknown as LogEntry), JSON.stringify(bad)).toBe("other");
      expect(eventWords(bad as unknown as LogEntry)).toEqual({ en: "A receipt", zh: "一張收據" });
    }
  });
});

describe("receipt numbers", () => {
  it("count from 1: receipt 1 is the sealed budget", () => {
    expect(receiptNumber(0)).toBe(1);
    expect(receiptNumber(3)).toBe(4);
  });
});

describe("who signed", () => {
  it("says you signed the budget, a cancellation and your own answers, and Wally signed everything else", async () => {
    const entries = await logAfter("normal", "REVOKE");
    expect(signedByYou(entries[0]!)).toBe(true);
    expect(signedByYou(find(entries, (e) => e.kind === "MANDATE_REVOKED"))).toBe(true);
    expect(signedByYou(find(entries, (e) => e.kind === "DECISION"))).toBe(false);
    expect(signedByYou(find(entries, (e) => e.kind === "CARD_MINTED"))).toBe(false);
    const answered = withDecision(find(entries, (e) => e.kind === "DECISION"), { resolves: "dec_ask000001", escalation: { state: "APPROVED", ...ESCALATION, answer: { choice: "APPROVE" } } });
    expect(signedByYou(answered)).toBe(true);
    expect(signedByYou(null as unknown as LogEntry)).toBe(false);
  });
});

/** The shared plain reasons (docs of the offline checker use the same sentences). */
const REASONS: Readonly<Record<string, readonly [string, string]>> = {
  SCHEMA: ["This receipt is not written the way Wally writes them, or is in the wrong place.", "這張收據的寫法不是 Wally 的格式，或位置不對。"],
  SEQ: ["Some receipts are missing, repeated or out of order.", "有收據缺失、重複或次序錯亂。"],
  PREV_HASH: ["This receipt no longer fits the one before it.", "這張收據與上一張對不上。"],
  PAYLOAD_HASH: ["What this receipt says was changed after it was written.", "這張收據的內容在寫下後被改動。"],
  ENTRY_HASH: ["The label on this receipt (its time or ids) was changed after it was written.", "這張收據的標示（時間或編號）在寫下後被改動。"],
  SIGNATURE: ["Wally's signature on this receipt is not valid.", "這張收據上 Wally 的簽署無效。"],
  PAYLOAD_SIGNATURE: ["Your signature (on the budget rules, a cancellation or an OK) is not valid, or belongs to another budget.", "你的簽署（預算規則、取消預算或確認）無效，或屬於另一個預算。"],
  TRUNCATED: ["Receipts are missing from the end, or were rewritten: the list does not match the saved checkpoint.", "收據在尾部缺失或被改寫：與已儲存的檢查點不符。"],
  KEYS: ["The keys given cannot be trusted, so nothing was checked.", "所給的金鑰不可信，所以沒有檢查任何東西。"],
  NO_DECISION: ["A card was made or charged with no earlier approval for it.", "有卡在沒有較早批准的情況下發出或扣款。"],
  DUPLICATE: ["Something that can only happen once happened twice.", "只可發生一次的事發生了兩次。"],
  CONSENT: ["Wally went ahead without your signed OK where one was needed.", "需要你簽署確認的地方，Wally 沒有取得就繼續。"],
  OVERSPEND: ["The money does not add up: a card or charge went past what was approved or what the budget allows.", "金額不符：有卡或扣款超出已批准或預算容許的數目。"],
  AFTER_REVOKE: ["A card was made or approved after the budget was cancelled or ended, or outside its dates.", "預算取消或完結後，或在有效日期以外，仍發卡或批准。"],
};

describe("plain reasons", () => {
  it("has the shared sentence for all 14 codes, in both languages", () => {
    expect(Object.keys(REASONS)).toHaveLength(14);
    for (const [code, [en, zh]] of Object.entries(REASONS)) expect(plainReasonWords(code), code).toEqual({ en, zh });
  });

  it("falls back to a safe sentence that shows no code, and does not trust inherited property names", () => {
    for (const unknown of ["SOMETHING_NEW", "__proto__", "toString", "constructor", ""]) {
      expect(plainReasonWords(unknown), unknown).toEqual(PLAIN.failUnknown);
    }
    expect(PLAIN.failUnknown.en).toBe("This receipt failed a check this screen does not know yet.");
  });
});

describe("the changed field in words", () => {
  it("names the amounts the demo changes in plain words, and anything else as a value", () => {
    expect(plainFieldWords("cart.total_minor")).toEqual({ words: { en: "the cart total", zh: "購物車總額" }, money: true });
    expect(plainFieldWords("limit_minor")).toEqual({ words: { en: "the card limit", zh: "卡額" }, money: true });
    expect(plainFieldWords("amount_minor")).toEqual({ words: { en: "the amount charged", zh: "扣款金額" }, money: true });
    expect(plainFieldWords("credentialSubject.rules.budget.amount_minor")).toEqual({ words: { en: "the budget", zh: "預算" }, money: true });
    expect(plainFieldWords("ts")).toEqual({ words: { en: "a value", zh: "一個數值" }, money: false });
    expect(plainFieldWords("payload.other_minor")).toEqual({ words: { en: "a value", zh: "一個數值" }, money: true });
    expect(plainFieldWords("__proto__").money).toBe(false);
  });
});

describe("which receipts are untouched, changed or not checked", () => {
  const seqs = [0, 1, 2, 3];
  const head = { log_id: "l", seq: 3, entry_hash: "a" };

  it("is neutral before any check", () => {
    expect(rowStatuses(seqs, null)).toEqual(["idle", "idle", "idle", "idle"]);
    expect(rowStatuses([], null)).toEqual([]);
  });

  it("is untouched for every receipt after a pass", () => {
    expect(rowStatuses(seqs, { ok: true, head })).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("leaves receipts newer than a passed check as not checked", () => {
    expect(rowStatuses([0, 1, 2, 3, 4, 5], { ok: true, head: { ...head, seq: 3 } })).toEqual(["ok", "ok", "ok", "ok", "after", "after"]);
  });

  it("is untouched before the failure, changed at it and not checked after it", () => {
    expect(rowStatuses(seqs, { ok: false, failedSeq: 1, reason: "PAYLOAD_HASH" })).toEqual(["ok", "changed", "after", "after"]);
    expect(rowStatuses(seqs, { ok: false, failedSeq: 0, reason: "SCHEMA" })).toEqual(["changed", "after", "after", "after"]);
    expect(rowStatuses(seqs, { ok: false, failedSeq: 3, reason: "ENTRY_HASH" })).toEqual(["ok", "ok", "ok", "changed"]);
  });

  it("marks no row as changed when the failure points past the end (receipts cut off)", () => {
    expect(rowStatuses(seqs, { ok: false, failedSeq: 4, reason: "TRUNCATED" })).toEqual(["ok", "ok", "ok", "ok"]);
  });

  it("goes by each receipt's own number, so a window of a long log keeps its meaning", () => {
    expect(rowStatuses([10, 11, 12], { ok: false, failedSeq: 11, reason: "SEQ" })).toEqual(["ok", "changed", "after"]);
  });
});

/** Every line of the table with its path. */
function lines(value: unknown, path = ""): readonly (readonly [string, string, string])[] {
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record["en"] === "string" && typeof record["zh"] === "string") return [[path, record["en"], record["zh"]]];
  return Object.entries(record).flatMap(([key, child]) => lines(child, path === "" ? key : `${path}.${key}`));
}

const EM_DASH = 0x2014;
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();

describe("the plain string table", () => {
  const all = lines(PLAIN);

  it("holds a real zh-HK line for every English one, with the same placeholders", () => {
    expect(all.length).toBeGreaterThan(60);
    for (const [path, en, zh] of all) {
      expect(en.trim().length, path).toBeGreaterThan(0);
      expect(zh, path).toMatch(/[一-鿿]/);
      expect(placeholders(zh), path).toEqual(placeholders(en));
    }
  });

  it("marks every zh-HK line for the native read", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/screens/proof/plainStrings.ts"), "utf8");
    const labelLines = source.split("\n").filter((l) => /\blabel\(/.test(l) && !l.trim().startsWith("//") && !l.includes("import"));
    expect(labelLines.length).toBe(all.length);
    for (const line of labelLines) expect(line, line).toContain("// NEEDS-REVIEW");
  });

  it("has no em dash and no emoji", () => {
    for (const [path, en, zh] of all) {
      for (const text of [en, zh]) {
        expect(text.includes(String.fromCharCode(EM_DASH)), path).toBe(false);
        expect(text, path).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });

  it("keeps the build-time words out (packet, mandate, mint, lai see) and the machinery out of the plain words", () => {
    // The 14 reasons are the shared sentences: two of them name the saved checkpoint and the signature, on purpose.
    const ALLOWED = new Set(["reasons.TRUNCATED", "save.checkpoint"]);
    const banned = /\b(packet|mandate|mint(ed|s|ing)?|lai[ -]?see|hash(es)?|jsonl?|seq|payload|engine|delegator|bytes?|checkpoints?|entry|entries)\b/i;
    for (const [path, en] of all) {
      if (ALLOWED.has(path)) continue;
      expect(en, path).not.toMatch(banned);
      expect(en, path).not.toMatch(/\b[A-Z]{2,}(_[A-Z]+)+\b/);
      expect(en, path).not.toMatch(/\bR\d{1,2}\b/);
    }
    for (const [path, , zh] of all) expect(zh, path).not.toMatch(/利是|紅包|雜湊/);
  });
});
