// The plain label of one log entry ("Approved", "You said no"). It is read from the UNVERIFIED parsed line with the own
// property readers of entry-fields.ts (no prototype lookups, typed checks, never throws) and only decides which words to
// show; whether the entry is genuine is the verdict's job. Every comparison is a switch on a string, never a property
// lookup by a log value, so a kind or event named like an object method cannot reach anything.
import { ownField, ownString } from "../entry-fields";
import type { Bi } from "../strings";

export type EventKey =
  | "sealed"
  | "approved"
  | "approvedByYou"
  | "stopped"
  | "deniedByYou"
  | "noAnswer"
  | "priceChanged"
  | "asked"
  | "cardMade"
  | "charged"
  | "declined"
  | "cancelled"
  | "cardExpired"
  | "revoked"
  | "ended"
  | "other";

// The shared wording table (event labels). Every zh-HK line is a draft owed a native read (C-12).
export const EVENT_LABELS: Readonly<Record<EventKey, Bi>> = {
  sealed: { en: "Budget sealed", zh: "預算已鎖定" }, // NEEDS-REVIEW zh-HK
  approved: { en: "Approved", zh: "已批准" }, // NEEDS-REVIEW zh-HK
  approvedByYou: { en: "You said yes", zh: "你已批准" }, // NEEDS-REVIEW zh-HK
  stopped: { en: "Stopped before paying", zh: "付款前已攔截" }, // NEEDS-REVIEW zh-HK
  deniedByYou: { en: "You said no", zh: "你已拒絕" }, // NEEDS-REVIEW zh-HK
  noAnswer: { en: "No answer in time", zh: "未有及時回覆" }, // NEEDS-REVIEW zh-HK
  priceChanged: { en: "Price changed at checkout", zh: "結帳時價格有變" }, // NEEDS-REVIEW zh-HK
  asked: { en: "Wally asked for your OK", zh: "Wally 請你確認" }, // NEEDS-REVIEW zh-HK
  cardMade: { en: "One-off card made", zh: "已發出一次性卡" }, // NEEDS-REVIEW zh-HK
  charged: { en: "Charged", zh: "已扣款" }, // NEEDS-REVIEW zh-HK
  declined: { en: "Charge declined", zh: "扣款被拒" }, // NEEDS-REVIEW zh-HK
  cancelled: { en: "Card cancelled", zh: "卡已取消" }, // NEEDS-REVIEW zh-HK
  cardExpired: { en: "Card expired", zh: "卡已過期" }, // NEEDS-REVIEW zh-HK
  revoked: { en: "You cancelled the budget", zh: "你已取消預算" }, // NEEDS-REVIEW zh-HK
  ended: { en: "Budget ended", zh: "預算已完結" }, // NEEDS-REVIEW zh-HK
  other: { en: "A receipt", zh: "一張收據" }, // NEEDS-REVIEW zh-HK
};

export function eventLabel(key: EventKey): Bi {
  return EVENT_LABELS[key];
}

function cardEventKey(event: string | undefined): EventKey {
  switch (event) {
    case "AUTHORISED":
      return "charged";
    case "DECLINED":
      return "declined";
    case "VOIDED":
      return "cancelled";
    case "EXPIRED":
      return "cardExpired";
    default:
      return "other";
  }
}

/** A DENY, told apart by what it closes: a price change at checkout, a timed-out question, the reader's own no. */
function denyKey(payload: unknown, resolves: boolean): EventKey {
  const state = ownString(ownField(payload, "escalation"), "state");
  const template = ownString(ownField(payload, "explanation"), "template_id");
  if (template === "R12.price_drift") return "priceChanged";
  if (state === "EXPIRED" || template === "R11.expired") return "noAnswer";
  return resolves && state === "DENIED" ? "deniedByYou" : "stopped";
}

function decisionKey(payload: unknown): EventKey {
  const resolves = (ownString(payload, "resolves") ?? "") !== "";
  switch (ownString(payload, "outcome")) {
    case "APPROVE":
      return resolves ? "approvedByYou" : "approved";
    case "ESCALATE":
      return "asked";
    case "DENY":
      return denyKey(payload, resolves);
    default:
      return "other";
  }
}

/** Which label an entry gets. Anything unreadable or unknown is "A receipt". */
export function eventKeyOf(entry: unknown): EventKey {
  const payload = ownField(entry, "payload");
  switch (ownString(entry, "kind")) {
    case "MANDATE_SEALED":
      return "sealed";
    case "DECISION":
      return decisionKey(payload);
    case "CARD_MINTED":
      return "cardMade";
    case "CARD_EVENT":
      return cardEventKey(ownString(payload, "event"));
    case "MANDATE_REVOKED":
      return "revoked";
    case "PACKET_EXPIRED":
      return "ended";
    default:
      return "other";
  }
}
