// Receipts model: one receipt per signed log entry, newest first, grouped by Hong Kong day, filtered by state, and found
// by decision id for the #/receipts?d=<id> deep link. Entries come from the offline mock's real hash-chained log.
import { FakeClock } from "@wally/core/testing";
import { describe, expect, it } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import type { LogEntry } from "../src/api/types";
import { m0Request } from "../src/booth/compile";
import {
  countByFilter,
  dayLabel,
  decisionFromHash,
  groupByDay,
  hkDayKey,
  matchesFilter,
  newestFirst,
  receiptForDecision,
  toReceipts,
} from "../src/screens/proof/receipts";

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

describe("toReceipts", () => {
  it("makes one receipt per entry, with the state, amount, merchant and decision in plain fields", async () => {
    const entries = await logAfter("normal", "flagged", "unverified", "overflow");
    const receipts = toReceipts(entries);
    expect(receipts.map((r) => r.seq)).toEqual(entries.map((e) => e.seq));
    expect(receipts[0]).toMatchObject({ kind: "MANDATE_SEALED", state: "sealed", amountMinor: 80000 });
    const approved = receipts.find((r) => r.state === "approved");
    expect(approved).toMatchObject({ amountMinor: 25900, cartProvenance: "SIMULATED" });
    expect(approved?.merchant).toBeTruthy();
    expect(approved?.item).toBeTruthy();
    expect(approved?.decisionId).toMatch(/\w+/);
    const card = receipts.find((r) => r.state === "cardMade");
    expect(card?.decisionId).toBe(approved?.decisionId);
    expect(card?.merchant).toBe(approved?.merchant);
    expect(receipts.find((r) => r.state === "stopped" && r.templateId === "R9.flagged")).toBeDefined();
    expect(receipts.find((r) => r.state === "needsOk")?.templateId).toBe("R9.unverified");
    expect(receipts.find((r) => r.templateId === "R3.over_remaining")?.amountMinor).toBe(55000);
    expect(receipts.every((r) => /^[0-9a-f]{64}$/.test(r.hash))).toBe(true);
  });

  it("names card events by what happened: paid, declined with the rail code, cancelled", async () => {
    const receipts = toReceipts(await logAfter("overshoot", "normal", "replay", "REVOKE"));
    const declined = receipts.filter((r) => r.state === "declined");
    expect(declined.map((r) => r.declineCode)).toEqual(expect.arrayContaining(["OVER_LIMIT", "CARD_USED"]));
    expect(receipts.some((r) => r.state === "paid" && r.amountMinor !== null)).toBe(true);
    expect(receipts.some((r) => r.state === "revoked")).toBe(true);
    expect(receipts.some((r) => r.state === "voided")).toBe(true);
    for (const r of receipts.filter((x) => x.kind === "CARD_EVENT")) expect(r.decisionId).not.toBeNull();
  });

  it("never throws on an empty log", () => {
    expect(toReceipts([])).toEqual([]);
  });
});

describe("filters and counts", () => {
  it("counts every filter and matches each receipt to the right ones", async () => {
    const receipts = toReceipts(await logAfter("normal", "flagged", "unverified", "overflow"));
    const counts = countByFilter(receipts);
    expect(counts.all).toBe(receipts.length);
    expect(counts.approved).toBe(receipts.filter((r) => r.state === "approved").length);
    expect(counts.stopped).toBe(2);
    expect(counts.needsOk).toBe(1);
    expect(counts.cards).toBe(receipts.filter((r) => r.kind === "CARD_MINTED" || r.kind === "CARD_EVENT").length);
    const sealed = receipts[0]!;
    expect(matchesFilter(sealed, "all")).toBe(true);
    expect(matchesFilter(sealed, "approved")).toBe(false);
    expect(matchesFilter(sealed, "cards")).toBe(false);
  });
});

describe("days", () => {
  it("keys by the Hong Kong day (UTC+8), not the UTC day", () => {
    expect(hkDayKey("2026-10-02T15:59:59Z")).toBe("2026-10-02");
    expect(hkDayKey("2026-10-02T16:00:00Z")).toBe("2026-10-03");
  });

  it("groups newest first and keeps the order inside each day", async () => {
    const receipts = newestFirst(toReceipts(await logAfter("normal", "flagged")));
    expect(receipts[0]!.seq).toBeGreaterThan(receipts.at(-1)!.seq);
    const groups = groupByDay(receipts);
    expect(groups.flatMap((g) => g.receipts.map((r) => r.seq))).toEqual(receipts.map((r) => r.seq));
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });

  it("says Today and Yesterday relative to now, and a short date otherwise, in either language", () => {
    const now = new Date("2026-10-03T04:00:00Z");
    expect(dayLabel("2026-10-03", now)).toEqual({ kind: "today" });
    expect(dayLabel("2026-10-02", now)).toEqual({ kind: "yesterday" });
    const older = dayLabel("2026-09-28", now);
    expect(older.kind).toBe("date");
    expect(older.kind === "date" && older.date.toISOString()).toBe("2026-09-28T04:00:00.000Z");
  });
});

describe("deep link", () => {
  it("reads the decision id from #/receipts?d=<id> and ignores anything else", () => {
    expect(decisionFromHash("#/receipts?d=dec_abc123")).toBe("dec_abc123");
    expect(decisionFromHash("#/receipts?x=1&d=dec_x")).toBe("dec_x");
    expect(decisionFromHash("#/receipts")).toBeNull();
    expect(decisionFromHash("#/receipts?d=")).toBeNull();
    expect(decisionFromHash("#/receipts?d=<script>")).toBeNull();
  });

  it("finds the decision receipt first, even when card entries share the decision id", async () => {
    const receipts = toReceipts(await logAfter("normal"));
    const decision = receipts.find((r) => r.kind === "DECISION")!;
    expect(receiptForDecision(receipts, decision.decisionId!)?.seq).toBe(decision.seq);
    expect(receiptForDecision(receipts, "dec_missing")).toBeUndefined();
  });
});
