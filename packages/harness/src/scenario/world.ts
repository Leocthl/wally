// Builds one Scenario from a DraftSpec: mandate, packet, listing, Scameter capture, recorded planner output, cart.
// Category modules decide the numbers and the label; this file does the bookkeeping and keeps the schemas valid.
import type {
  Cart,
  ListingRecord,
  Mandate,
  PacketState,
  PlannerReplayRecord,
  ProposeCartInput,
  ScameterCapture,
} from "@laisee/core/generated";
import { EXAMPLE_MANDATE, RAIL, SCENARIO_EPOCH, type Category } from "../config";
import type { Rng } from "../prng";
import type { HistoryEvent, InjectionInfo, Scenario, ScenarioEvents, ScenarioLabel } from "../types";
import { AGENT_DID, DELEGATOR_DID } from "../keys";
import { buildScenarioCart } from "./cart";
import { historyOf, packetFromHistory } from "./history";
import { formatHkd } from "./money";
import type { Template } from "./templates";


const HOUR_MS = 3_600_000;
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

export interface Ctx {
  readonly seed: number;
  readonly index: number;
  /** k-th scenario of this category (0-based). */
  readonly occurrence: number;
  readonly category: Category;
  readonly variant: string;
  readonly rng: Rng;
  readonly nowMs: number;
  /** Letters and digits that identify the scenario inside ids. */
  readonly tag: string;
  readonly scenarioId: string;
}

export interface PerPurchase {
  readonly hardCapMinor?: number;
  readonly shareBp?: number;
  readonly askAboveMinor?: number;
}

export type CaptureSpec =
  | { readonly state: "NO_RECORD" | "FLAGGED"; readonly ageS: number }
  | { readonly state: "NOT_CHECKED" };

export interface ExtraItem {
  readonly title: string;
  readonly category: string;
  readonly unitPriceMinor: number;
}

export interface DraftSpec {
  readonly template: Template;
  readonly budgetMinor: number;
  readonly remainingMinor: number;
  readonly perPurchase?: PerPurchase;
  readonly allow?: readonly string[] | null;
  readonly deny?: readonly string[];
  readonly categories?: readonly [string, ...string[]];
  readonly requireCapture?: boolean;
  readonly maxCaptureAgeS?: number;
  readonly velocity?: { readonly maxMints: number; readonly windowS: number };
  /** Seconds from now to the mandate's end; negative = already expired. Default F90.m2_expiry. */
  readonly validUntilOffsetS?: number;
  readonly packetStatus?: PacketState["status"];
  readonly activeCardLimits?: readonly number[];
  /** Seconds before now at which past mints happened. */
  readonly mintAgesS?: readonly number[];
  readonly capture: CaptureSpec;
  readonly unitPriceMinor: number;
  readonly shippingMinor: number;
  readonly feesMinor?: number;
  /** Complete listing text as the judge will read it. */
  readonly text: string;
  readonly extraItems?: readonly ExtraItem[];
  /** Titles the recorded planner proposes. Default: the template item only. */
  readonly proposalTitles?: readonly string[];
  readonly events?: Partial<ScenarioEvents>;
  readonly label: ScenarioLabel;
  readonly injection?: InjectionInfo | null;
  readonly intentText?: string;
  readonly plannerNote?: string;
}

export function makeTag(seed: number, index: number): string {
  return `h${seed.toString(36)}x${index.toString(36).padStart(3, "0")}`;
}

export function scenarioId(seed: number, index: number, category: Category): string {
  return `h${seed.toString(36)}-i${String(index).padStart(4, "0")}-${category}`;
}

export function epochMs(): number {
  return Date.parse(SCENARIO_EPOCH);
}

/** min(hard cap, adaptive share of remaining); undefined when the mandate sets neither. R4 semantics, ground truth only. */
export function effectiveCap(pp: PerPurchase | undefined, remainingMinor: number): number | undefined {
  const terms = [
    pp?.hardCapMinor,
    pp?.shareBp === undefined ? undefined : Math.floor((remainingMinor * pp.shareBp) / 10_000),
  ].filter((t): t is number => t !== undefined);
  return terms.length === 0 ? undefined : Math.min(...terms);
}

/** The most one purchase may cost: min(remaining, effective cap, rail ceiling [F1.ceiling]). Ground truth for the overspend metric. */
export function allowedLimit(pp: PerPurchase | undefined, remainingMinor: number): number {
  const cap = effectiveCap(pp, remainingMinor);
  return Math.min(remainingMinor, cap ?? remainingMinor, RAIL.ceilingMinor);
}

function buildMandate(ctx: Ctx, spec: DraftSpec): Mandate {
  const pp = spec.perPurchase;
  const perPurchase =
    pp === undefined || (pp.hardCapMinor === undefined && pp.shareBp === undefined && pp.askAboveMinor === undefined)
      ? {}
      : {
          per_purchase: {
            ...(pp.hardCapMinor === undefined ? {} : { hard_cap_minor: pp.hardCapMinor }),
            ...(pp.shareBp === undefined ? {} : { share_of_remaining_bp: pp.shareBp }),
            ...(pp.askAboveMinor === undefined ? {} : { ask_above_minor: pp.askAboveMinor }),
          },
        };
  const offsetS = spec.validUntilOffsetS ?? EXAMPLE_MANDATE.expiryS;
  const validUntilMs = ctx.nowMs + offsetS * 1000;
  const intent = spec.intentText ?? `${formatHkd(spec.budgetMinor)}, clothes, verified sellers.`;
  return {
    id: `mnd_${ctx.tag}`,
    delegator: DELEGATOR_DID,
    agent: AGENT_DID,
    intent_text: intent,
    rules: {
      budget: { amount_minor: spec.budgetMinor, currency: "HKD" },
      ...perPurchase,
      categories: spec.categories === undefined ? ["apparel"] : [...spec.categories],
      merchants: { allow: spec.allow === undefined || spec.allow === null ? null : [...spec.allow], deny: [...(spec.deny ?? [])] },
      seller_check: {
        require_capture: spec.requireCapture ?? true,
        ...(spec.maxCaptureAgeS === undefined ? {} : { max_capture_age_s: spec.maxCaptureAgeS }),
      },
      ...(spec.velocity === undefined ? {} : { velocity: { max_mints: spec.velocity.maxMints, window_s: spec.velocity.windowS } }),
    },
    valid_from: iso(Math.min(epochMs() - HOUR_MS, validUntilMs - HOUR_MS)),
    valid_until: iso(validUntilMs),
  };
}

function buildPacket(ctx: Ctx, spec: DraftSpec, mandate: Mandate): { readonly packet: PacketState; readonly history: readonly HistoryEvent[] } {
  const history = historyOf({
    tag: ctx.tag,
    budgetMinor: spec.budgetMinor,
    remainingMinor: spec.remainingMinor,
    activeCardLimits: spec.activeCardLimits ?? [],
    mintAgesS: spec.mintAgesS ?? [],
    revoked: spec.packetStatus === "REVOKED",
  });
  return { packet: packetFromHistory(mandate, history, ctx.nowMs), history };
}

function buildCapture(ctx: Ctx, spec: DraftSpec): ScameterCapture | null {
  const c = spec.capture;
  if (c.state === "NOT_CHECKED") return null;
  return {
    capture_ref: spec.template.scameterRef,
    subject_domain: spec.template.domain,
    state: c.state,
    captured_at: iso(ctx.nowMs - c.ageS * 1000),
    searched: c.state === "FLAGGED" ? ["url", "payment_account"] : ["url"],
    provenance: "SIMULATED",
    note: c.state === "FLAGGED" ? "SIMULATED flag: no real seller, phone, FPS id or page name." : "No record found. No record is not safe [F6].",
  };
}

function buildListing(ctx: Ctx, spec: DraftSpec, capture: ScameterCapture | null): ListingRecord {
  const t = spec.template;
  const [first, ...rest] = [
    { title: t.title, category: t.category, unit_price_minor: spec.unitPriceMinor },
    ...(spec.extraItems ?? []).map((e) => ({ title: e.title, category: e.category, unit_price_minor: e.unitPriceMinor })),
  ];
  if (!first) throw new Error("unreachable: the template item is always present");
  return {
    id: `lst_${ctx.tag}`,
    url: `https://${t.domain}/p/${t.slug}-${ctx.tag}`,
    merchant: { name: t.merchantName, domain: t.domain },
    items: [first, ...rest],
    shipping_minor: spec.shippingMinor,
    fees_minor: spec.feesMinor ?? 0,
    currency: "HKD",
    seller: t.seller,
    text: spec.text,
    observed_at: iso(ctx.nowMs - ctx.rng.int(2, 25) * 60_000),
    scameter_ref: capture?.capture_ref ?? null,
    provenance: "SIMULATED",
  };
}

const DEFAULT_EVENTS: ScenarioEvents = {
  merchantMode: "honest",
  merchantDeltaMinor: 0,
  submissions: 1,
  replayCharge: false,
  revoke: "none",
  judgeFault: "none",
};

/** Builds the full scenario. Throws if the spec is inconsistent, so a generator bug fails loudly and early. */
export function assemble(ctx: Ctx, spec: DraftSpec): Scenario {
  const mandate = buildMandate(ctx, spec);
  const { packet, history } = buildPacket(ctx, spec, mandate);
  const capture = buildCapture(ctx, spec);
  const listing = buildListing(ctx, spec, capture);
  const titles = spec.proposalTitles ?? [spec.template.title];
  const [firstTitle, ...restTitles] = titles;
  if (firstTitle === undefined) throw new Error(`${ctx.scenarioId}: empty proposal`);
  const proposal: ProposeCartInput = {
    listing_url: listing.url,
    items: [{ title: firstTitle, qty: 1 }, ...restTitles.map((title) => ({ title, qty: 1 }))],
    note: spec.plannerNote ?? "Recorded planner choice for this scenario.",
  };
  const planner: PlannerReplayRecord = { scenario: ctx.scenarioId.slice(0, 41), listing_ids: [listing.id], proposal };
  let cart: Cart;
  try {
    cart = buildScenarioCart({ cartId: `crt_${ctx.tag}`, mandate, listing, proposal, scameter: capture, now: new Date(ctx.nowMs) });
  } catch (err) {
    throw new Error(`${ctx.scenarioId}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  return {
    id: ctx.scenarioId,
    index: ctx.index,
    category: ctx.category,
    variant: ctx.variant,
    provenance: "SIMULATED",
    label: spec.label,
    now: iso(ctx.nowMs),
    mandate,
    packet,
    history,
    listing,
    scameterCapture: capture,
    planner,
    requestText: `Buy ${titles.join(" and ")} from ${listing.merchant.name}.`,
    cart,
    events: { ...DEFAULT_EVENTS, ...spec.events },
    limits: { allowedMinor: allowedLimit(spec.perPurchase, spec.remainingMinor) },
    injection: spec.injection ?? null,
  };
}
