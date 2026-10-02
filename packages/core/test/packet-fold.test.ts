// A-02 packet math (U1): commit on mint, release on VOIDED/EXPIRED, settle on AUTHORISED. Integer cents.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LogEntry } from "../src/generated";
import { PacketFoldError, foldLedger, foldPacket } from "../src/packet";
import { validatePacketState } from "../src/schema";
import { PROPERTY_SEED } from "./engine-arbitraries";
import {
  CREDENTIAL,
  LOG_ID,
  MANDATE_ID,
  append,
  approveDecision,
  card,
  cardEvent,
  decisionIdOf,
  escalateDecision,
  resolvingDecision,
  sealedLog,
} from "./packet-helpers";

const NOW = new Date("2026-10-03T02:30:00Z");
const A1 = card(1, 25900, "2026-10-03T02:05:02Z");

describe("foldPacket storyline [F20, F21, F23]", () => {
  it("starts at the sealed budget: HK$800 left", () => {
    const p = foldPacket(sealedLog(), NOW);
    expect(p).toMatchObject({ mandate_id: "mnd_demoM0", log_id: LOG_ID, budget_minor: 80000, committed_minor: 0, spent_minor: 0, remaining_minor: 80000, status: "ACTIVE" });
    expect(p).toMatchObject({ expires_at: CREDENTIAL.validUntil, folded_through_seq: 0, computed_at: NOW.toISOString(), active_cards: [], mint_times: [], open_escalations: [] });
    expect(validatePacketState(p).ok).toBe(true);
  });

  it("commits HK$259 on mint and settles it on AUTHORISED: HK$541 left", () => {
    const minted = append(sealedLog(), "CARD_MINTED", A1, A1.minted_at);
    expect(foldPacket(minted, NOW)).toMatchObject({ committed_minor: 25900, spent_minor: 0, remaining_minor: 54100, active_cards: [{ id: A1.id, limit_minor: 25900 }], mint_times: [A1.minted_at] });
    const settled = append(minted, "CARD_EVENT", cardEvent(A1.id, "AUTHORISED", "2026-10-03T02:06:00Z", 25900), "2026-10-03T02:06:00Z");
    const p = foldPacket(settled, NOW);
    expect(p).toMatchObject({ committed_minor: 0, spent_minor: 25900, remaining_minor: 54100, active_cards: [], folded_through_seq: 2 });
    const a4 = card(4, 12000, "2026-10-03T02:20:02Z");
    const twice = append(append(settled, "CARD_MINTED", a4, a4.minted_at), "CARD_EVENT", cardEvent(a4.id, "AUTHORISED", "2026-10-03T02:21:00Z", 12000), "2026-10-03T02:21:00Z");
    expect(foldPacket(twice, NOW)).toMatchObject({ spent_minor: 37900, remaining_minor: 42100, mint_times: [A1.minted_at, a4.minted_at] });
  });

  it("releases the difference when the actual charge is lower than the limit", () => {
    const log = append(append(sealedLog(), "CARD_MINTED", A1, A1.minted_at), "CARD_EVENT", cardEvent(A1.id, "AUTHORISED", "2026-10-03T02:06:00Z", 25000), "2026-10-03T02:06:00Z");
    expect(foldPacket(log, NOW)).toMatchObject({ committed_minor: 0, spent_minor: 25000, remaining_minor: 55000 });
  });

  it.each(["VOIDED", "EXPIRED"] as const)("releases the whole limit on %s", (event) => {
    const log = append(append(sealedLog(), "CARD_MINTED", A1, A1.minted_at), "CARD_EVENT", cardEvent(A1.id, event, "2026-10-03T02:07:00Z"), "2026-10-03T02:07:00Z");
    expect(foldPacket(log, NOW)).toMatchObject({ committed_minor: 0, spent_minor: 0, remaining_minor: 80000, active_cards: [] });
  });

  it("holds the limit on DECLINED (S1 rail variant)", () => {
    const log = append(append(sealedLog(), "CARD_MINTED", A1, A1.minted_at), "CARD_EVENT", cardEvent(A1.id, "DECLINED", "2026-10-03T02:06:00Z", 26000), "2026-10-03T02:06:00Z");
    expect(foldPacket(log, NOW)).toMatchObject({ committed_minor: 25900, remaining_minor: 54100, active_cards: [{ id: A1.id }] });
  });

  it("counts a retried AUTHORISED with the same idempotency key once", () => {
    const ev = cardEvent(A1.id, "AUTHORISED", "2026-10-03T02:06:00Z", 25900, "chk_a1");
    const log = append(append(append(sealedLog(), "CARD_MINTED", A1, A1.minted_at), "CARD_EVENT", ev, ev.at), "CARD_EVENT", ev, ev.at);
    expect(foldPacket(log, NOW)).toMatchObject({ spent_minor: 25900, remaining_minor: 54100 });
  });

  it("counts an AUTHORISED for an unknown or used card as spent (conservative)", () => {
    const stray = append(sealedLog(), "CARD_EVENT", cardEvent("crd_unknown01", "AUTHORISED", "2026-10-03T02:06:00Z", 1000), "2026-10-03T02:06:00Z");
    expect(foldPacket(stray, NOW)).toMatchObject({ spent_minor: 1000, remaining_minor: 79000 });
  });

  it("is EXHAUSTED at zero remaining", () => {
    const big = card(9, 80000, "2026-10-03T02:05:02Z");
    expect(foldPacket(append(sealedLog(), "CARD_MINTED", big, big.minted_at), NOW).status).toBe("EXHAUSTED");
  });
});

describe("foldPacket status, escalations and failure modes", () => {
  it("is REVOKED after MANDATE_REVOKED (precedence over EXPIRED)", () => {
    const revocation = { mandate_id: MANDATE_ID, revoked_at: "2026-10-03T02:10:00Z", signer: CREDENTIAL.issuer, signature: "A".repeat(86) };
    const log = append(append(sealedLog(), "MANDATE_REVOKED", revocation, revocation.revoked_at), "PACKET_EXPIRED", { mandate_id: MANDATE_ID, expired_at: "2026-10-03T02:11:00Z" }, "2026-10-03T02:11:00Z");
    expect(foldPacket(log, NOW).status).toBe("REVOKED");
  });

  it("is EXPIRED after PACKET_EXPIRED or once now reaches valid_until", () => {
    const log = append(sealedLog(), "PACKET_EXPIRED", { mandate_id: MANDATE_ID, expired_at: "2026-10-03T02:11:00Z" }, "2026-10-03T02:11:00Z");
    expect(foldPacket(log, NOW).status).toBe("EXPIRED");
    expect(foldPacket(sealedLog(), new Date(CREDENTIAL.validUntil)).status).toBe("EXPIRED");
  });

  it("tracks open escalations until a decision resolves them", () => {
    const opened = append(sealedLog(), "DECISION", escalateDecision("dec_escalated0001", "2026-10-03T02:13:00.000Z"), "2026-10-03T02:12:00Z");
    expect(foldPacket(opened, NOW).open_escalations).toEqual([{ decision_id: "dec_escalated0001", expires_at: "2026-10-03T02:13:00.000Z" }]);
    const closed = append(opened, "DECISION", resolvingDecision("dec_resolved00001", "dec_escalated0001"), "2026-10-03T02:13:00Z");
    expect(foldPacket(closed, NOW).open_escalations).toEqual([]);
  });

  it("throws PacketFoldError on a log it cannot trust (the caller fails closed)", () => {
    const sealed = sealedLog();
    expect(() => foldPacket([], NOW)).toThrow(PacketFoldError);
    const minted = append(sealed, "CARD_MINTED", A1, A1.minted_at);
    expect(() => foldPacket(minted.slice(1), NOW)).toThrow(PacketFoldError);
    expect(() => foldPacket([minted[0], { ...minted[1], seq: 5 }] as LogEntry[], NOW)).toThrow(/seq/);
    expect(() => foldPacket([minted[0], { ...minted[1], log_id: "log_otherLog1" }] as LogEntry[], NOW)).toThrow(/log_id/);
    expect(() => foldPacket([minted[0], { ...minted[1], payload: { ...A1, limit_minor: -5 } }] as LogEntry[], NOW)).toThrow(/schema/);
    expect(() => foldPacket(append(sealed, "MANDATE_SEALED", CREDENTIAL, "2026-10-03T02:01:00Z"), NOW)).toThrow(/MANDATE_SEALED/);
    expect(() => foldPacket(sealed, new Date(Number.NaN))).toThrow(PacketFoldError);
  });

  it("does not mutate its input", () => {
    const log = Object.freeze(append(sealedLog(), "CARD_MINTED", A1, A1.minted_at).map((e) => Object.freeze(e)));
    expect(() => foldPacket(log, NOW)).not.toThrow();
  });
});

describe("H4: an APPROVE holds its limit until its card is logged (audit S-RAIL-2)", () => {
  const T = "2026-10-03T02:05:00Z";
  const approved = (n: number, limit: number) => append(sealedLog(), "DECISION", approveDecision(decisionIdOf(n), limit), T);

  it("holds the approved limit inside committed_minor before the mint, then the card takes it over", () => {
    const log = approved(1, 25900);
    expect(foldPacket(log, NOW)).toMatchObject({ committed_minor: 25900, remaining_minor: 54100, active_cards: [], status: "ACTIVE" });
    expect(foldLedger(log, NOW).held).toEqual([{ decision_id: decisionIdOf(1), limit_minor: 25900 }]);
    const minted = append(log, "CARD_MINTED", A1, A1.minted_at);
    expect(foldPacket(minted, NOW)).toMatchObject({ committed_minor: 25900, remaining_minor: 54100, active_cards: [{ id: A1.id }] });
    expect(foldLedger(minted, NOW).held).toEqual([]);
  });

  it("a second APPROVE decided on that fold sees the hold: two approvals cannot spend the same budget", () => {
    const two = append(approved(1, 50000), "DECISION", approveDecision(decisionIdOf(2), 30000), T);
    expect(foldPacket(two, NOW)).toMatchObject({ committed_minor: 80000, remaining_minor: 0, status: "EXHAUSTED" });
  });

  it("throws on an over-committed log instead of clamping (two approvals decided on one stale fold)", () => {
    const stale = append(approved(1, 50000), "DECISION", approveDecision(decisionIdOf(2), 50000), T);
    expect(() => foldPacket(stale, NOW)).toThrow(/over-committed/);
    const c1 = card(1, 50000, T);
    const c2 = card(2, 50000, T);
    const minted = append(append(sealedLog(), "CARD_MINTED", c1, T), "CARD_MINTED", c2, T);
    expect(() => foldPacket(minted, NOW)).toThrow(PacketFoldError);
  });

  it("a later decision that resolves the approval ends the hold", () => {
    const resolved = append(approved(1, 25900), "DECISION", { ...resolvingDecision("dec_resolvedA0001", decisionIdOf(1)) }, T);
    expect(foldPacket(resolved, NOW)).toMatchObject({ committed_minor: 0, remaining_minor: 80000 });
  });

  it("holds end when the packet is REVOKED or EXPIRED (no card can be minted after that, I6)", () => {
    const revocation = { mandate_id: MANDATE_ID, revoked_at: T, signer: CREDENTIAL.issuer, signature: "A".repeat(86) };
    expect(foldPacket(append(approved(1, 25900), "MANDATE_REVOKED", revocation, T), NOW)).toMatchObject({ committed_minor: 0, status: "REVOKED" });
    expect(foldPacket(approved(1, 25900), new Date(CREDENTIAL.validUntil))).toMatchObject({ committed_minor: 0, status: "EXPIRED" });
  });

  it("a card logged as USED is settled at its whole limit and never released", () => {
    const used = { ...A1, state: "USED" as const };
    const log = append(append(approved(1, 25900), "CARD_MINTED", used, T), "CARD_EVENT", cardEvent(A1.id, "VOIDED", T), T);
    expect(foldPacket(log, NOW)).toMatchObject({ committed_minor: 0, spent_minor: 25900, remaining_minor: 54100, active_cards: [] });
  });

  it("the same APPROVE or card logged twice counts once", () => {
    const twice = append(approved(1, 25900), "DECISION", approveDecision(decisionIdOf(1), 25900), T);
    expect(foldPacket(twice, NOW)).toMatchObject({ committed_minor: 25900 });
    const minted = append(append(twice, "CARD_MINTED", A1, T), "CARD_MINTED", A1, T);
    expect(foldPacket(minted, NOW)).toMatchObject({ committed_minor: 25900, remaining_minor: 54100 });
  });
});

describe("foldPacket invariants (fast-check)", () => {
  /** approve: none = a card with no logged APPROVE (legacy logs), before = APPROVE then its card, only = an APPROVE whose mint failed. */
  type Step = { kind: "mint"; limit: number; approve: "none" | "before" | "only" } | { kind: "event"; pick: number; event: "AUTHORISED" | "DECLINED" | "VOIDED" | "EXPIRED"; ratio: number };
  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ kind: fc.constant("mint" as const), limit: fc.integer({ min: 0, max: 30000 }), approve: fc.constantFrom("none" as const, "before" as const, "before" as const, "only" as const) }),
    fc.record({ kind: fc.constant("event" as const), pick: fc.nat(), event: fc.constantFrom("AUTHORISED", "DECLINED", "VOIDED", "EXPIRED"), ratio: fc.integer({ min: 0, max: 100 }) }),
  );

  type Built = { log: LogEntry[]; cards: { id: string; limit: number; active: boolean }[]; remaining: number };

  function mintStep(acc: Built, s: Extract<Step, { kind: "mint" }>, n: number, ts: string): Built {
    if (s.limit > acc.remaining) return acc; // the engine never approves more than remaining (R3)
    const approvedLog = s.approve === "none" ? acc.log : append(acc.log, "DECISION", approveDecision(decisionIdOf(n), s.limit), ts);
    if (s.approve === "only") return { ...acc, log: approvedLog, remaining: acc.remaining - s.limit };
    const c = card(n, s.limit, ts);
    return { log: append(approvedLog, "CARD_MINTED", c, ts), cards: [...acc.cards, { id: c.id, limit: s.limit, active: true }], remaining: acc.remaining - s.limit };
  }

  /** Rail-realistic logs: single use (only ACTIVE cards authorise, void or expire), never over the limit. */
  function build(steps: readonly Step[]): LogEntry[] {
    const start = Date.parse("2026-10-03T02:01:00Z");
    return steps.reduce<Built>(
      (acc, s, i) => {
        const ts = new Date(start + i * 1000).toISOString();
        if (s.kind === "mint") return mintStep(acc, s, i + 1, ts);
        const candidates = s.event === "DECLINED" ? acc.cards : acc.cards.filter((c) => c.active);
        const target = candidates[s.pick % Math.max(candidates.length, 1)];
        if (target === undefined) return acc;
        const amount = Math.floor((target.limit * s.ratio) / 100);
        const cards = s.event === "DECLINED" ? acc.cards : acc.cards.map((c) => (c.id === target.id ? { ...c, active: false } : c));
        return { ...acc, cards, log: append(acc.log, "CARD_EVENT", cardEvent(target.id, s.event, ts, amount), ts) };
      },
      { log: sealedLog(), cards: [], remaining: 80000 },
    ).log;
  }

  it("never goes negative and keeps budget = committed + spent + remaining, committed = active cards + holds", () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 25 }), (steps) => {
        const { packet: p, held } = foldLedger(build(steps), NOW);
        expect(p.committed_minor).toBeGreaterThanOrEqual(0);
        expect(p.spent_minor).toBeGreaterThanOrEqual(0);
        expect(p.remaining_minor).toBeGreaterThanOrEqual(0);
        expect(p.committed_minor + p.spent_minor + p.remaining_minor).toBe(p.budget_minor);
        const holds = held.reduce((s, h) => s + h.limit_minor, 0);
        expect(p.committed_minor).toBe(p.active_cards.reduce((s, c) => s + c.limit_minor, 0) + holds);
        expect(Number.isSafeInteger(p.remaining_minor)).toBe(true);
      }),
      { numRuns: 150, seed: PROPERTY_SEED },
    );
  }, 60_000);

  it("restores the remaining amount when every card is voided or expired", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 20000 }), { maxLength: 4 }), (limits) => {
        const minted = limits.reduce<LogEntry[]>((log, limit, i) => append(log, "CARD_MINTED", card(i + 1, limit, "2026-10-03T02:05:00Z"), "2026-10-03T02:05:00Z"), sealedLog());
        const released = limits.reduce<LogEntry[]>((log, _l, i) => append(log, "CARD_EVENT", cardEvent(card(i + 1, 0, "2026-10-03T02:05:00Z").id, i % 2 ? "VOIDED" : "EXPIRED", "2026-10-03T02:06:00Z"), "2026-10-03T02:06:00Z"), minted);
        expect(foldPacket(released, NOW)).toMatchObject({ committed_minor: 0, spent_minor: 0, remaining_minor: 80000 });
      }),
      { seed: PROPERTY_SEED },
    );
  });

  it("is deterministic", () => {
    const log = append(sealedLog(), "CARD_MINTED", A1, A1.minted_at);
    expect(JSON.stringify(foldPacket(log, NOW))).toBe(JSON.stringify(foldPacket(log, NOW)));
  });
});
