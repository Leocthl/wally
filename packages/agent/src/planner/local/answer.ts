// The model's answer: a JSON schema built from the listing records actually supplied (so the model can only name
// real listings and items), and the parser that re-checks every field in code. The parsed answer is untrusted
// until it passes; the proposal built from it has no money fields and a note written from a template (I4).
import type { ListingRecord } from "@wally/core/generated";
import type { ProposeCartInput } from "@wally/core/ports";
import { validateProposeCartInput } from "@wally/core/schema";
import { parseTitle } from "../candidates";
import type { LocalPlannerConfig } from "./config";

export type AbstainAction = "ask_shopper" | "give_up";

export interface ChosenItem {
  readonly title: string;
  readonly qty: number;
}

export type PlanAnswer =
  | { readonly kind: "propose"; readonly listingUrl: string; readonly items: readonly ChosenItem[]; readonly qtyClamped: boolean; readonly note: string }
  | { readonly kind: "abstain"; readonly action: AbstainAction; readonly note: string }
  | { readonly kind: "invalid"; readonly reason: string };

const noteSchema = (config: LocalPlannerConfig) => ({ type: "string", maxLength: config.noteMaxChars });

/**
 * anyOf: one "propose" branch per listing (listing_url is a const, titles an enum of that listing's items, qty
 * 1..maxQty) plus one short abstain branch, so an abstention costs a few tokens and never names an item. The note
 * comes first: the model states what the request asks for before it commits to an action (measured: with the
 * action first, a listed hoodie was missed on a Cantonese request).
 */
export function buildAnswerSchema(listings: readonly ListingRecord[], config: LocalPlannerConfig): Record<string, unknown> {
  const propose = listings.map((listing) => ({
    type: "object",
    additionalProperties: false,
    required: ["note", "action", "listing_url", "items"],
    properties: {
      note: noteSchema(config),
      action: { const: "propose" },
      listing_url: { const: listing.url },
      items: {
        type: "array",
        minItems: 1,
        maxItems: Math.max(1, Math.min(config.maxItems, listing.items.length)),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "qty"],
          properties: {
            title: { enum: listing.items.map((i) => i.title) },
            qty: { type: "integer", minimum: 1, maximum: config.maxQty },
          },
        },
      },
    },
  }));
  const abstain = {
    type: "object",
    additionalProperties: false,
    required: ["note", "action"],
    properties: { note: noteSchema(config), action: { enum: ["ask_shopper", "give_up"] } },
  };
  return { anyOf: [...propose, abstain] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const invalid = (reason: string): PlanAnswer => ({ kind: "invalid", reason });

function readNote(value: unknown, config: LocalPlannerConfig): string {
  return typeof value === "string" ? value.slice(0, config.noteMaxChars) : "";
}

type ItemsResult = { readonly ok: true; readonly items: readonly ChosenItem[]; readonly clamped: boolean } | { readonly ok: false; readonly reason: string };

function readItems(raw: unknown, listing: ListingRecord, config: LocalPlannerConfig): ItemsResult {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > config.maxItems) return { ok: false, reason: "items missing or too many" };
  const titles = new Set(listing.items.map((i) => i.title));
  const items: ChosenItem[] = [];
  let clamped = false;
  for (const entry of raw as unknown[]) {
    if (!isRecord(entry) || typeof entry["title"] !== "string" || !titles.has(entry["title"])) return { ok: false, reason: "an item title is not in the listing" };
    const qty = entry["qty"];
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) return { ok: false, reason: "a quantity is not a whole number of at least 1" };
    if (items.some((i) => i.title === entry["title"])) return { ok: false, reason: "an item is named twice" };
    clamped = clamped || qty > config.maxQty;
    items.push({ title: entry["title"], qty: Math.min(qty, config.maxQty) });
  }
  return { ok: true, items, clamped };
}

/** Parses and re-checks the model output against the listings it was given. Never throws. */
export function parseAnswer(content: string, listings: readonly ListingRecord[], config: LocalPlannerConfig): PlanAnswer {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return invalid("the answer is not valid JSON");
  }
  if (!isRecord(json)) return invalid("the answer is not an object");
  const action = json["action"];
  if (action === "ask_shopper" || action === "give_up") return { kind: "abstain", action, note: readNote(json["note"], config) };
  if (action !== "propose") return invalid("unknown action");
  const listing = listings.find((l) => l.url === json["listing_url"]);
  if (listing === undefined) return invalid("listing_url is not one of the listings supplied");
  const items = readItems(json["items"], listing, config);
  if (!items.ok) return invalid(items.reason);
  return { kind: "propose", listingUrl: listing.url, items: items.items, qtyClamped: items.clamped, note: readNote(json["note"], config) };
}

/** Order total in minor units for a budget re-check after a stop; computed in code, never by the model. */
export function totalMinor(listing: ListingRecord, items: readonly ChosenItem[]): number {
  const subtotal = items.reduce((sum, item) => sum + item.qty * (listing.items.find((i) => i.title === item.title)?.unit_price_minor ?? Number.POSITIVE_INFINITY), 0);
  return subtotal + listing.shipping_minor + listing.fees_minor;
}

/**
 * ProposeCartInput without money fields. The note is a fixed template over the listing's own titles, never the
 * model's prose (explanations come from templates, not LLM text). null when the schema check fails.
 */
export function toProposal(listingUrl: string, items: readonly ChosenItem[], afterBudgetStop: boolean): ProposeCartInput | null {
  const [first, ...rest] = items.map((i) => ({ title: i.title, qty: i.qty }));
  if (first === undefined) return null;
  const names = items.map((i) => parseTitle(i.title).baseName).join(", ");
  const lead = afterBudgetStop ? "Closest cheaper item to the request" : "Closest listed item to the request";
  const proposal: ProposeCartInput = {
    listing_url: listingUrl,
    items: [first, ...rest],
    note: `${lead}: ${names}.`.slice(0, 280),
  };
  return validateProposeCartInput(proposal).ok ? proposal : null;
}
