// Proposal checks: the planner's propose_cart input is untrusted (I4). Specific codes first (empty items,
// qty, duplicates), then the full propose-cart.schema.json check, which also refuses any money field.
import proposeCartSchema from "../../../../schemas/propose-cart.schema.json" with { type: "json" };
import type { ProposeCartInput } from "../generated";
import { formatIssues, validateProposeCartInput } from "../schema";
import type { CartRejected, InvalidCartCode } from "./types";

/** propose-cart.schema.json items.qty.maximum: the default qty bound (no separate number). */
export const SCHEMA_MAX_QTY: number = proposeCartSchema.properties.items.items.properties.qty.maximum;

export type Step<T> = { readonly ok: true; readonly value: T } | CartRejected;

export const reject = (code: InvalidCartCode, detail: string): CartRejected => ({ ok: false, reason: "invalid_cart", code, detail });

export const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => v !== null && typeof v === "object" && !Array.isArray(v);

function qtyProblem(items: readonly unknown[], bound: number): string | null {
  if (!Number.isSafeInteger(bound) || bound < 1) return "the qty bound is not a positive integer";
  for (const [index, item] of items.entries()) {
    const qty = isRecord(item) ? item["qty"] : undefined;
    if (typeof qty !== "number") continue; // missing or non-numeric qty: the schema check reports it
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > bound) return `item ${index}: qty must be an integer from 1 to ${bound}`;
  }
  return null;
}

function duplicateTitle(items: readonly unknown[]): string | null {
  const titles = items.map((item) => (isRecord(item) ? item["title"] : undefined)).filter((t): t is string => typeof t === "string");
  return titles.find((title, index) => titles.indexOf(title) !== index) ?? null;
}

/** The proposal as a schema-valid ProposeCartInput, or the first problem found. */
export function checkProposal(proposal: unknown, maxQty: number | undefined): Step<ProposeCartInput> {
  if (!isRecord(proposal)) return reject("proposal_invalid", "the proposal is not an object");
  const items = proposal["items"];
  if (Array.isArray(items)) {
    if (items.length === 0) return reject("items_empty", "the proposal names no items");
    const qty = qtyProblem(items, maxQty ?? SCHEMA_MAX_QTY);
    if (qty !== null) return reject("qty_invalid", qty);
    const duplicate = duplicateTitle(items);
    if (duplicate !== null) return reject("duplicate_item", "the same title appears twice; name each item once");
  }
  const checked = validateProposeCartInput(proposal);
  if (!checked.ok) return reject("proposal_invalid", `propose_cart input fails its schema: ${formatIssues(checked.errors)}`);
  return { ok: true, value: checked.value };
}
