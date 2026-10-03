// Which of the 15 plain labels a log entry gets: sealed, approved, you said yes, stopped, you said no, no answer in time, price
// changed, asked for your OK, one-off card made, charged, declined, card cancelled, card expired, you cancelled, ended. Reads the
// entry as data and never throws. Kept apart from the strings so the Home screen, which only needs the key, does not carry the
// whole table of words.
import type { PLAIN } from "./plainStrings";

export type EventKey = keyof typeof PLAIN.events;

type Loose = Readonly<Record<string, unknown>>;

export const asRecord = (value: unknown): Loose | null => (value !== null && typeof value === "object" ? (value as Loose) : null);
const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

export function own<T>(table: Readonly<Record<string, T>>, key: string): T | null {
  return Object.prototype.hasOwnProperty.call(table, key) ? (table[key] ?? null) : null;
}

const CARD_EVENT_KEY: Readonly<Record<string, EventKey>> = { AUTHORISED: "charged", DECLINED: "declined", VOIDED: "voided", EXPIRED: "cardExpired" };

/** A stop that closes an earlier decision is told apart by what the person did, then by the rule that fired. */
function stopKey(payload: Loose): EventKey {
  if (!isText(payload["resolves"])) return "stopped";
  const state = asRecord(payload["escalation"])?.["state"];
  const template = asRecord(payload["explanation"])?.["template_id"];
  // Your own no also cites R11, so the answer is read before the template.
  if (state === "DENIED") return "youSaidNo";
  if (state === "EXPIRED" || template === "R11.expired") return "noAnswer";
  if (template === "R12.price_drift") return "priceChanged";
  return "stopped";
}

function decisionKey(payload: Loose | null): EventKey {
  if (payload === null) return "other";
  switch (payload["outcome"]) {
    case "APPROVE":
      return isText(payload["resolves"]) ? "youSaidYes" : "approved";
    case "ESCALATE":
      return "asked";
    case "DENY":
      return stopKey(payload);
    default:
      return "other";
  }
}

/** Which of the 15 plain labels (or "other") a log entry gets. Reads the entry as data; never throws. */
export function eventKey(entry: unknown): EventKey {
  const e = asRecord(entry);
  const payload = asRecord(e?.["payload"] ?? null);
  switch (e?.["kind"]) {
    case "MANDATE_SEALED":
      return "sealed";
    case "DECISION":
      return decisionKey(payload);
    case "CARD_MINTED":
      return "cardMade";
    case "CARD_EVENT":
      return own(CARD_EVENT_KEY, String(payload?.["event"])) ?? "other";
    case "MANDATE_REVOKED":
      return "revoked";
    case "PACKET_EXPIRED":
      return "ended";
    default:
      return "other";
  }
}

