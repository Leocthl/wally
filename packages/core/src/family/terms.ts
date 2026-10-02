// One comparison per rule: the child's term against the parent's. Each returns the first widening it finds, or null.
// "Not looser" is read term by term: for every term the parent sets, the child sets one that is as tight or tighter.
// Defaults count: a rule left out runs at the engine default, so the comparison uses that value on both sides.
import { ENGINE_CONFIG } from "../config";
import type { Mandate } from "../generated";
import { hkd } from "./format";
import type { FamilyField, FamilyValue, FamilyViolation } from "./types";

type Rules = Mandate["rules"];

const violation = (field: FamilyField, requested: FamilyValue, allowed: FamilyValue, message: string): FamilyViolation => ({ ok: false, field, requested, allowed, message });

const isMinor = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** The parent is open (started, not ended) and the child does not outlast it. Ended means now >= valid_until, as R2. */
export function checkValidity(parent: Mandate, child: Mandate, now: Date): FamilyViolation | null {
  const nowMs = now.getTime();
  const from = Date.parse(parent.valid_from);
  const until = Date.parse(parent.valid_until);
  const childUntil = Date.parse(child.valid_until);
  if (Number.isNaN(nowMs) || Number.isNaN(from) || Number.isNaN(until) || Number.isNaN(childUntil)) {
    return violation("valid_until", child.valid_until, parent.valid_until, "A date on the budget could not be read, so it was not allowed.");
  }
  if (nowMs < from) return violation("valid_from", now.toISOString(), parent.valid_from, "The parent budget has not started yet.");
  if (nowMs >= until) return violation("valid_until", child.valid_until, parent.valid_until, "The parent budget has ended.");
  if (childUntil > until) return violation("valid_until", child.valid_until, parent.valid_until, `The budget would end after the parent budget does (${parent.valid_until}).`);
  return null;
}

/** The child's budget fits what the parent has left after the other children (integer minor units, same currency). */
export function checkBudget(parent: Mandate, child: Mandate, allocatedMinor: number): FamilyViolation | null {
  const requested = child.rules.budget.amount_minor;
  const ceiling = parent.rules.budget.amount_minor;
  const sane = isMinor(requested) && isMinor(ceiling) && isMinor(allocatedMinor);
  const allowed = sane ? Math.max(0, ceiling - allocatedMinor) : 0;
  const sameCurrency = child.rules.budget.currency === parent.rules.budget.currency;
  if (sane && sameCurrency && requested <= allowed) return null;
  return violation("budget", Number.isFinite(requested) ? requested : 0, allowed, `The budget ${sane ? hkd(requested) : "asked for"} is more than the parent allows (${hkd(allowed)}).`);
}

export function checkCategories(parent: Mandate, child: Mandate): FamilyViolation | null {
  const allowed = parent.rules.categories;
  const outside = child.rules.categories.filter((c) => !allowed.includes(c));
  if (outside.length === 0) return null;
  return violation("categories", child.rules.categories, allowed, `The parent does not allow ${outside.join(", ")}.`);
}

// ---------- merchants: what the child permits must be a subset of what the parent permits ----------

const normalise = (domain: string): string => domain.trim().toLowerCase();

/** Same reading as R6 (rules/scope.ts): a deny entry covers its subdomains; an allow list matches exact domains. */
function coveredBy(domain: string, entry: string): boolean {
  const e = normalise(entry);
  const d = normalise(domain);
  return d === e || d.endsWith(`.${e}`);
}

function permits(merchants: Rules["merchants"], domain: string): boolean {
  if (merchants.deny.some((entry) => coveredBy(domain, entry))) return false;
  return merchants.allow === null || merchants.allow.map(normalise).includes(normalise(domain));
}

/** Child allows any domain: only fine under a parent that also allows any and whose every deny the child denies too. */
function openChildWithin(parent: Rules["merchants"], child: Rules["merchants"]): boolean {
  return parent.allow === null && parent.deny.every((entry) => child.deny.some((own) => coveredBy(entry, own)));
}

function describeMerchants(m: Rules["merchants"]): string {
  const base = m.allow === null ? "any merchant" : `only ${m.allow.join(", ") || "no merchant"}`;
  return m.deny.length === 0 ? base : `${base}, never ${m.deny.join(", ")}`;
}

export function checkMerchants(parent: Mandate, child: Mandate): FamilyViolation | null {
  const own = child.rules.merchants;
  const theirs = parent.rules.merchants;
  const within = own.allow === null ? openChildWithin(theirs, own) : own.allow.every((domain) => !permits(own, domain) || permits(theirs, domain));
  if (within) return null;
  return violation("merchants", describeMerchants(own), describeMerchants(theirs), "The merchants are wider than the parent allows.");
}

// ---------- seller check ----------

export function checkSeller(parent: Mandate, child: Mandate): FamilyViolation | null {
  const theirs = parent.rules.seller_check;
  const own = child.rules.seller_check;
  if (theirs.require_capture !== true) return null; // nothing is asked of sellers, so nothing can be loosened
  if (own.require_capture !== true) {
    return violation("seller_check.require_capture", false, true, "The parent requires verified sellers, so the budget must too.");
  }
  const parentAge = theirs.max_capture_age_s ?? ENGINE_CONFIG.seller.max_capture_age_s;
  const childAge = own.max_capture_age_s ?? ENGINE_CONFIG.seller.max_capture_age_s;
  if (childAge <= parentAge) return null;
  return violation("seller_check.max_capture_age_s", childAge, parentAge, "The budget accepts older seller checks than the parent does.");
}

// ---------- per purchase ----------

const PER_PURCHASE_TERMS: readonly (readonly [FamilyField, "hard_cap_minor" | "ask_above_minor" | "share_of_remaining_bp", string])[] = [
  ["per_purchase.hard_cap_minor", "hard_cap_minor", "a single purchase cap"],
  ["per_purchase.ask_above_minor", "ask_above_minor", "the amount above which you are asked"],
  ["per_purchase.share_of_remaining_bp", "share_of_remaining_bp", "the share of what is left for one purchase"],
];

/** A term the parent sets must be set by the child at the same value or lower (a lower cap, or asking sooner, is tighter). */
export function checkPerPurchase(parent: Mandate, child: Mandate): FamilyViolation | null {
  const theirs = parent.rules.per_purchase;
  if (theirs === undefined) return null;
  const own = child.rules.per_purchase;
  for (const [field, key, words] of PER_PURCHASE_TERMS) {
    const limit = theirs[key];
    if (limit === undefined) continue;
    const mine = own?.[key];
    if (mine !== undefined && mine <= limit) continue;
    const money = key !== "share_of_remaining_bp";
    const show = (n: number): string => (money ? hkd(n) : `${n / 100}%`);
    const detail = mine === undefined ? `The budget sets no limit for ${words}` : `The budget allows ${show(mine)} for ${words}`;
    return violation(field, mine ?? "not set", limit, `${detail}, but the parent allows ${show(limit)}.`);
  }
  return null;
}

// ---------- velocity ----------

interface Velocity {
  readonly max: number;
  readonly windowS: number;
}

const velocityOf = (rules: Rules): Velocity => ({
  max: rules.velocity?.max_mints ?? ENGINE_CONFIG.velocity.max_mints,
  windowS: rules.velocity?.window_s ?? ENGINE_CONFIG.velocity.window_s,
});

/**
 * R7 allows at most `max` mints in any window of `windowS`. The child permits at most max * ceil(parentWindow / childWindow)
 * mints in a parent-sized window (one run of back-to-back child windows covers it), so it is not looser when that is at most
 * the parent's count. Tight when the windows divide; otherwise it may refuse a child that is in fact within (fail closed).
 */
export function checkVelocity(parent: Mandate, child: Mandate): FamilyViolation | null {
  const theirs = velocityOf(parent.rules);
  const own = velocityOf(child.rules);
  const worst = own.max * Math.ceil(theirs.windowS / own.windowS);
  if (Number.isSafeInteger(worst) && worst <= theirs.max) return null;
  const text = (v: Velocity): string => `${v.max} per ${v.windowS} s`;
  return violation("velocity", text(own), text(theirs), "The budget allows purchases more often than the parent does.");
}
