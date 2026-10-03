// One purchase, one row: the receipts of a purchase (decision, one-off card, charge, any answer to a question) are grouped by the
// decision it started with, worded by where it ended up, and the receipts of no purchase stand alone. Real hash-chained logs
// from the offline mock, so the groups are tested against what the engine really writes.
import { FakeClock } from "@wally/core/testing";
import { describe, expect, it } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import type { LogEntry } from "../src/api/types";
import { m0Request } from "../src/booth/compile";
import { toReceipts, type Receipt } from "../src/screens/proof/receipts";
import { countItemsByFilter, groupPurchases, itemMatchesFilter, itemsNewestFirst, type Purchase } from "../src/screens/proof/purchases";

type Step = Parameters<MockApiClient["runScenario"]>[0] | "REVOKE" | "YES" | "NO";

async function logAfter(...steps: Step[]): Promise<readonly LogEntry[]> {
  const clock = new FakeClock();
  const api = new MockApiClient({ clock, sleep: async () => undefined, pace: 0 });
  await api.seal(m0Request(clock.now()));
  let open: string | undefined;
  for (const step of steps) {
    if (step === "REVOKE") await api.revoke();
    else if (step === "YES" || step === "NO") await api.answerEscalation({ decisionId: open ?? "", choice: step === "YES" ? "APPROVE" : "DENY" });
    else {
      const run = await api.runScenario(step);
      if (run.outcome === "ESCALATE") open = run.decisionId;
    }
  }
  return (await api.getLog()).entries;
}

async function itemsAfter(...steps: Step[]) {
  const receipts = toReceipts(await logAfter(...steps));
  return { receipts, items: groupPurchases(receipts) };
}

const purchases = (items: ReturnType<typeof groupPurchases>): readonly Purchase[] => items.flatMap((i) => (i.kind === "purchase" ? [i.purchase] : []));
const states = (p: Purchase): readonly string[] => p.steps.map((s) => s.state);

describe("groupPurchases", () => {
  it("makes one row of a bought item: the decision, the one-off card and the charge, as a paid purchase", async () => {
    const { receipts, items } = await itemsAfter("normal");
    expect(items.map((i) => i.kind)).toEqual(["single", "purchase"]);
    const [p] = purchases(items);
    expect(states(p!)).toEqual(["approved", "cardMade", "paid"]);
    expect(p).toMatchObject({ state: "paid", amountMinor: 25900 });
    expect(p!.lead.kind).toBe("DECISION");
    expect(p!.lead.seq).toBe(1);
    expect(p!.headline.state).toBe("paid");
    expect(p!.id).toBe(p!.lead.decisionId);
    // Every receipt is in exactly one row.
    const listed = items.flatMap((i) => (i.kind === "purchase" ? i.purchase.steps : [i.receipt]));
    expect(listed.map((r) => r.seq)).toEqual(receipts.map((r) => r.seq));
  });

  it("keeps the budget sealed, cancelled and ended as rows of their own", async () => {
    const { items } = await itemsAfter("normal", "REVOKE");
    const singles = items.flatMap((i) => (i.kind === "single" ? [i.receipt.state] : []));
    expect(singles).toEqual(["sealed", "revoked"]);
  });

  it("shows a stop as one receipt in one row", async () => {
    const { items } = await itemsAfter("flagged");
    const [p] = purchases(items);
    expect(p!.steps).toHaveLength(1);
    expect(p).toMatchObject({ state: "stopped" });
    expect(p!.headline.seq).toBe(p!.lead.seq);
  });

  it("keeps a question and its answer together: asked, you said yes, a card, the charge", async () => {
    const { items } = await itemsAfter("unverified", "YES");
    const ps = purchases(items);
    expect(ps).toHaveLength(1);
    const p = ps[0]!;
    expect(p.steps.map((s) => s.event)).toEqual(["asked", "youSaidYes", "cardMade", "charged"]);
    expect(p.state).toBe("paid");
    expect(p.lead.event).toBe("asked");
    expect(p.lead.seq).toBe(1);
  });

  it("ends a question you said no to as stopped, in the same row", async () => {
    const { items } = await itemsAfter("unverified", "NO");
    const [p] = purchases(items);
    expect(p!.steps.map((s) => s.event)).toEqual(["asked", "youSaidNo"]);
    expect(p!.state).toBe("stopped");
    expect(p!.headline.event).toBe("youSaidNo");
  });

  it("leaves a question that is still open as Needs your OK", async () => {
    const { items } = await itemsAfter("unverified");
    const [p] = purchases(items);
    expect(p).toMatchObject({ state: "needsOk" });
    expect(p!.steps).toHaveLength(1);
  });

  it("keeps a price change at checkout in the purchase it belongs to, and ends it stopped", async () => {
    const { items } = await itemsAfter("drift");
    const [p] = purchases(items);
    expect(p!.steps.map((s) => s.event)).toEqual(expect.arrayContaining(["approved", "cardMade", "voided", "priceChanged"]));
    expect(p!.state).toBe("stopped");
  });

  it("keeps a declined second try with the purchase, and calls it paid because it was", async () => {
    const { items } = await itemsAfter("normal", "replay");
    const ps = purchases(items);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.state).toBe("paid");
    expect(states(ps[0]!)).toEqual(expect.arrayContaining(["approved", "cardMade", "paid", "declined"]));
  });

  it("calls a card that was cancelled with the budget before it was used a cancelled card", async () => {
    const { items } = await itemsAfter("revoke", "REVOKE");
    const ps = purchases(items);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.state).toBe("voided");
    expect(ps[0]!.headline.state).toBe("voided");
  });

  it("makes separate rows of separate purchases, in order of their newest receipt", async () => {
    const { items } = await itemsAfter("normal", "flagged", "small", "overflow");
    const ps = purchases(items);
    expect(ps.map((p) => p.state)).toEqual(["paid", "stopped", "paid", "stopped"]);
    const seqs = items.map((i) => i.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(itemsNewestFirst(items).map((i) => i.seq)).toEqual([...seqs].reverse());
  });

  it("gives an answered question the place of its newest receipt, so an answer brings it to the top", async () => {
    const { items } = await itemsAfter("unverified", "flagged", "YES");
    const ps = purchases(items);
    const order = itemsNewestFirst(items).flatMap((i) => (i.kind === "purchase" ? [i.purchase.lead.event] : []));
    expect(ps).toHaveLength(2);
    expect(order[0]).toBe("asked");
  });

  it("calls a question the budget outlived stopped, and leaves one that is still open as Needs your OK", async () => {
    const open = purchases((await itemsAfter("unverified")).items)[0]!;
    expect(open.state).toBe("needsOk");
    const cancelled = purchases((await itemsAfter("unverified", "REVOKE")).items)[0]!;
    expect(cancelled.state).toBe("stopped");
    expect(cancelled.steps.map((s) => s.event)).toEqual(["asked"]);
    // Answered before the budget ended: the answer decides, as before.
    const answered = purchases((await itemsAfter("unverified", "YES", "REVOKE")).items)[0]!;
    expect(answered.state).toBe("paid");
  });

  it("never throws on an empty log, and leaves receipts of a decision it cannot find as rows of their own", async () => {
    expect(groupPurchases([])).toEqual([]);
    const { receipts } = await itemsAfter("normal");
    const withoutDecision = receipts.filter((r) => r.kind !== "DECISION");
    const items = groupPurchases(withoutDecision);
    expect(items.every((i) => i.kind === "single")).toBe(true);
    expect(items).toHaveLength(withoutDecision.length);
  });

  it("does not follow a loop of resolutions forever", async () => {
    const { receipts } = await itemsAfter("unverified", "YES");
    const [asked, answered] = receipts.filter((r) => r.kind === "DECISION") as [Receipt, Receipt];
    const looped = receipts.map((r) => (r === asked ? { ...r, resolves: answered.decisionId } : r));
    expect(() => groupPurchases(looped)).not.toThrow();
  });
});

describe("filters over rows", () => {
  it("counts rows, and a row is in every filter any of its receipts is in", async () => {
    const { items } = await itemsAfter("normal", "flagged", "unverified", "overflow");
    expect(countItemsByFilter(items)).toEqual({ all: 5, approved: 1, stopped: 2, needsOk: 1, cards: 1 });
    const paid = items.find((i) => i.kind === "purchase" && i.purchase.state === "paid")!;
    expect(itemMatchesFilter(paid, "approved")).toBe(true);
    expect(itemMatchesFilter(paid, "cards")).toBe(true);
    expect(itemMatchesFilter(paid, "stopped")).toBe(false);
    const sealed = items[0]!;
    expect(itemMatchesFilter(sealed, "all")).toBe(true);
    expect(itemMatchesFilter(sealed, "approved")).toBe(false);
  });

  it("keeps a question you said yes to under Needs OK and under Approved", async () => {
    const { items } = await itemsAfter("unverified", "YES");
    const p = items.find((i) => i.kind === "purchase")!;
    for (const f of ["approved", "needsOk", "cards"] as const) expect(itemMatchesFilter(p, f), f).toBe(true);
    expect(itemMatchesFilter(p, "stopped")).toBe(false);
  });
});

describe("the receipt number, said once", () => {
  it("is the same sentence in Proof's table of words and in the light module Home reads", async () => {
    const { PLAIN } = await import("../src/screens/proof/plainStrings");
    const { RECEIPT_NO, receiptNumber } = await import("../src/screens/proof/receiptNo");
    expect(PLAIN.receiptNo).toEqual(RECEIPT_NO);
    expect([0, 1, 5].map(receiptNumber)).toEqual([1, 2, 6]);
  });
});
