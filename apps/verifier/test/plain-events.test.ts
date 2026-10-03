// The plain label of one log entry ("Approved", "You said no"), computed from an UNVERIFIED parsed line with own
// properties only. It must give the same label as the shared wording table, and never throw or follow a prototype.
import { describe, expect, it } from "vitest";
import { eventKeyOf, EVENT_LABELS, eventLabel, type EventKey } from "../src/plain/events";

const decision = (payload: Record<string, unknown>): unknown => ({ kind: "DECISION", payload });
const cardEvent = (event: unknown): unknown => ({ kind: "CARD_EVENT", payload: { event } });

/** The shared wording table (event labels), copied here on purpose: a typo in either copy fails this test. */
const TABLE: readonly (readonly [string, unknown, EventKey, string, string])[] = [
  ["MANDATE_SEALED", { kind: "MANDATE_SEALED", payload: {} }, "sealed", "Budget sealed", "預算已鎖定"],
  ["APPROVE", decision({ outcome: "APPROVE" }), "approved", "Approved", "已批准"],
  ["APPROVE resolving an escalation", decision({ outcome: "APPROVE", resolves: "dec_E1" }), "approvedByYou", "You said yes", "你已批准"],
  ["DENY", decision({ outcome: "DENY" }), "stopped", "Stopped before paying", "付款前已攔截"],
  ["DENY answered no", decision({ outcome: "DENY", resolves: "dec_E1", escalation: { state: "DENIED" } }), "deniedByYou", "You said no", "你已拒絕"],
  ["DENY, escalation EXPIRED", decision({ outcome: "DENY", resolves: "dec_E1", escalation: { state: "EXPIRED" } }), "noAnswer", "No answer in time", "未有及時回覆"],
  ["DENY, template R11.expired", decision({ outcome: "DENY", resolves: "dec_E1", explanation: { template_id: "R11.expired" } }), "noAnswer", "No answer in time", "未有及時回覆"],
  ["DENY, template R12.price_drift", decision({ outcome: "DENY", resolves: "dec_A1", explanation: { template_id: "R12.price_drift" } }), "priceChanged", "Price changed at checkout", "結帳時價格有變"],
  ["ESCALATE", decision({ outcome: "ESCALATE" }), "asked", "Wally asked for your OK", "Wally 請你確認"],
  ["CARD_MINTED", { kind: "CARD_MINTED", payload: {} }, "cardMade", "One-off card made", "已發出一次性卡"],
  ["CARD_EVENT AUTHORISED", cardEvent("AUTHORISED"), "charged", "Charged", "已扣款"],
  ["CARD_EVENT DECLINED", cardEvent("DECLINED"), "declined", "Charge declined", "扣款被拒"],
  ["CARD_EVENT VOIDED", cardEvent("VOIDED"), "cancelled", "Card cancelled", "卡已取消"],
  ["CARD_EVENT EXPIRED", cardEvent("EXPIRED"), "cardExpired", "Card expired", "卡已過期"],
  ["MANDATE_REVOKED", { kind: "MANDATE_REVOKED", payload: {} }, "revoked", "You cancelled the budget", "你已取消預算"],
  ["PACKET_EXPIRED", { kind: "PACKET_EXPIRED", payload: {} }, "ended", "Budget ended", "預算已到期"],
  ["anything else", { kind: "SOMETHING_NEW", payload: {} }, "other", "A receipt", "一張收據"],
];

describe("the label of each kind of entry, as the shared table says", () => {
  it.each(TABLE)("%s", (_name, entry, key, en, zh) => {
    expect(eventKeyOf(entry)).toBe(key);
    expect(eventLabel(key)).toEqual({ en, zh });
  });

  it("has a label for every key, and the table covers every key", () => {
    expect(Object.keys(EVENT_LABELS).sort()).toEqual([...new Set(TABLE.map((row) => row[2]))].sort());
  });

  it("uses plain words: no raw kind names, no codes", () => {
    for (const label of Object.values(EVENT_LABELS)) {
      expect(label.en).not.toMatch(/[A-Z]{2,}_|_[A-Z]{2,}|\bR\d|seq|hash|payload/i);
      expect(label.en.length).toBeGreaterThan(2);
      expect(label.zh.length).toBeGreaterThan(1);
    }
  });
});

describe("how a decision is told apart", () => {
  it("reads the template when the escalation says nothing", () => {
    expect(eventKeyOf(decision({ outcome: "DENY", resolves: "dec_E1", explanation: { template_id: "R11.expired" } }))).toBe("noAnswer");
  });

  it("calls a price change at checkout before anything else on a DENY", () => {
    const payload = { outcome: "DENY", resolves: "dec_A1", escalation: { state: "DENIED" }, explanation: { template_id: "R12.price_drift" } };
    expect(eventKeyOf(decision(payload))).toBe("priceChanged");
  });

  it("says a DENY that closes nothing, whatever its reason, was stopped before paying", () => {
    expect(eventKeyOf(decision({ outcome: "DENY", explanation: { template_id: "R3.over_remaining" } }))).toBe("stopped");
    expect(eventKeyOf(decision({ outcome: "DENY", escalation: { state: "DENIED" } }))).toBe("stopped");
  });

  it("says a DENY that closes an escalation with no sign of a no was stopped before paying", () => {
    expect(eventKeyOf(decision({ outcome: "DENY", resolves: "dec_E1" }))).toBe("stopped");
    expect(eventKeyOf(decision({ outcome: "DENY", resolves: "dec_E1", escalation: { state: "APPROVED" } }))).toBe("stopped");
  });

  it("does not count an empty resolves as closing anything", () => {
    expect(eventKeyOf(decision({ outcome: "APPROVE", resolves: "" }))).toBe("approved");
  });

  it("falls back to a plain receipt for an outcome it does not know", () => {
    expect(eventKeyOf(decision({ outcome: "MAYBE" }))).toBe("other");
    expect(eventKeyOf(decision({}))).toBe("other");
  });
});

describe("hostile or broken input", () => {
  it.each([
    ["null", null],
    ["a string", "DECISION"],
    ["a number", 7],
    ["a list", []],
    ["a list of an entry", [{ kind: "DECISION" }]],
    ["no kind", {}],
    ["a kind that is not text", { kind: 5 }],
    ["a kind that is an object", { kind: { x: 1 } }],
    ["a decision with no payload", { kind: "DECISION" }],
    ["a decision whose payload is text", { kind: "DECISION", payload: "APPROVE" }],
    ["a decision whose payload is a list", { kind: "DECISION", payload: ["APPROVE"] }],
    ["a card event with no payload", { kind: "CARD_EVENT" }],
    ["a card event of a kind it does not know", cardEvent("REFUNDED")],
    ["a card event that is not text", cardEvent(5)],
    ["a card event named like an object method", cardEvent("constructor")],
    ["a card event named __proto__", cardEvent("__proto__")],
    ["a kind named like an object method", { kind: "toString" }],
    ["a kind named __proto__", { kind: "__proto__" }],
  ])("%s is a plain receipt and does not throw", (_name, entry) => {
    expect(() => eventKeyOf(entry)).not.toThrow();
    expect(eventKeyOf(entry)).toBe("other");
  });

  it("never follows the prototype chain", () => {
    const inherited = Object.create({ kind: "DECISION", payload: { outcome: "APPROVE" } }) as unknown;
    expect(eventKeyOf(inherited)).toBe("other");
    const inheritedPayload = { kind: "DECISION", payload: Object.create({ outcome: "APPROVE" }) as unknown };
    expect(eventKeyOf(inheritedPayload)).toBe("other");
  });

  it("does not take a __proto__ key from parsed JSON for a real field", () => {
    const parsed = JSON.parse('{"__proto__":{"kind":"DECISION","payload":{"outcome":"APPROVE"}}}') as unknown;
    expect(eventKeyOf(parsed)).toBe("other");
    const nested = JSON.parse('{"kind":"DECISION","payload":{"__proto__":{"outcome":"APPROVE"}}}') as unknown;
    expect(eventKeyOf(nested)).toBe("other");
  });

  it("does not pollute Object.prototype", () => {
    eventKeyOf(JSON.parse('{"kind":"DECISION","payload":{"__proto__":{"polluted":"yes"}}}'));
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
