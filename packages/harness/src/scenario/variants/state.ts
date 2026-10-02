// Categories about mandate and packet state at decision time: velocity_burst (R7, R8), expired (R2), revoked (R2).
import { RAIL, VELOCITY } from "../../config";
import { afterMintLabel, approvedLabel, between, cleanSpec, moneyFrame, stoppedLabel, type VariantDef } from "./shared";
import type { Ctx, DraftSpec } from "../world";

interface StateOpts {
  readonly activeCardLimits?: readonly number[];
  readonly mintAgesS?: readonly number[];
}

/** Plain clean purchase inside every limit, on a packet that already holds `activeCardLimits` and past mints. */
function onPacket(ctx: Ctx, opts: StateOpts, label: DraftSpec["label"], extra: Partial<DraftSpec> = {}): DraftSpec {
  const base = moneyFrame(ctx, "none");
  const committed = (opts.activeCardLimits ?? []).reduce((acc, l) => acc + l, 0);
  const remainingMinor = base.remainingMinor - committed;
  const frame = { ...base, remainingMinor, allowedMinor: remainingMinor, freeMinor: remainingMinor };
  const total = Math.max(1_000, between(ctx, 20, 80, remainingMinor));
  return {
    ...cleanSpec(ctx, frame, total, label),
    ...(opts.activeCardLimits === undefined ? {} : { activeCardLimits: opts.activeCardLimits }),
    ...(opts.mintAgesS === undefined ? {} : { mintAgesS: opts.mintAgesS }),
    ...extra,
  };
}

const ages = (ctx: Ctx, count: number, lo: number, hi: number): number[] => Array.from({ length: count }, () => ctx.rng.int(lo, hi));
const cards = (ctx: Ctx, count: number): number[] => Array.from({ length: count }, () => ctx.rng.int(30, 90) * 100);

// Mint ages are chosen at least 100 s away from the window edge so no implementation's boundary rule matters.
const IN_WINDOW: readonly [number, number] = [60, VELOCITY.windowS - 100];
const OUTSIDE_WINDOW: readonly [number, number] = [VELOCITY.windowS + 100, VELOCITY.windowS * 3];

export const VELOCITY_BURST: readonly VariantDef[] = [
  {
    name: "burst_r7",
    build: (ctx) =>
      onPacket(ctx, { mintAgesS: ages(ctx, VELOCITY.maxMints, ...IN_WINDOW) }, stoppedLabel({ decision: "DENY", rule: "R7", templateId: "R7.velocity", stop: "S6", note: "the mint limit is already reached inside the rolling window [F32]" })),
  },
  {
    name: "two_in_window",
    build: (ctx) => onPacket(ctx, { mintAgesS: ages(ctx, VELOCITY.maxMints - 1, ...IN_WINDOW) }, approvedLabel({ note: "one mint short of the window limit [F32]" })),
  },
  {
    name: "max_active_r8",
    build: (ctx) =>
      onPacket(ctx, { activeCardLimits: cards(ctx, RAIL.maxActive) }, stoppedLabel({ decision: "DENY", rule: "R8", templateId: "R8.max_active", stop: null, note: "two cards are already active [F1.active]" })),
  },
  {
    name: "old_mints_do_not_count",
    build: (ctx) =>
      onPacket(ctx, { mintAgesS: [...ages(ctx, VELOCITY.maxMints - 1, ...IN_WINDOW), ...ages(ctx, 1, ...OUTSIDE_WINDOW)] }, approvedLabel({ note: "an older mint has left the rolling window [F32]" })),
  },
  {
    name: "burst_override",
    build: (ctx) => {
      const velocity = { maxMints: 2, windowS: 900 } as const; // SIMULATED mandate override of the F32 default
      return onPacket(ctx, { mintAgesS: ages(ctx, velocity.maxMints, 60, velocity.windowS - 100) }, stoppedLabel({ decision: "DENY", rule: "R7", templateId: "R7.velocity", stop: "S6", note: "mandate overrides the default window limit and it is reached" }), { velocity });
    },
  },
  {
    name: "one_active_card",
    build: (ctx) => onPacket(ctx, { activeCardLimits: cards(ctx, RAIL.maxActive - 1) }, approvedLabel({ note: "one active card is below the maximum [F1.active]" })),
  },
];

const DAY_S = 86_400;

export const EXPIRED: readonly VariantDef[] = [
  {
    name: "mandate_expired",
    build: (ctx) =>
      onPacket(ctx, {}, stoppedLabel({ decision: "DENY", rule: "R2", templateId: "R2.expired", stop: "S6", note: "the mandate ended before this cart" }), {
        validUntilOffsetS: -ctx.rng.int(600, 3 * DAY_S),
        packetStatus: "EXPIRED",
      }),
  },
  {
    name: "valid_far",
    build: (ctx) => onPacket(ctx, {}, approvedLabel({ note: "mandate valid for days" }), { validUntilOffsetS: ctx.rng.int(2 * 3_600, 7 * DAY_S) }),
  },
  {
    name: "expired_long_ago",
    build: (ctx) =>
      onPacket(ctx, {}, stoppedLabel({ decision: "DENY", rule: "R2", templateId: "R2.expired", stop: "S6", note: "the mandate ended days ago" }), {
        validUntilOffsetS: -ctx.rng.int(3 * DAY_S, 30 * DAY_S),
        packetStatus: "EXPIRED",
      }),
  },
  {
    name: "expiring_soon",
    build: (ctx) => onPacket(ctx, {}, approvedLabel({ note: "mandate ends later today but after the card would expire" }), { validUntilOffsetS: ctx.rng.int(40 * 60, 90 * 60) }),
  },
];

export const REVOKED: readonly VariantDef[] = [
  {
    name: "revoked_before",
    build: (ctx) => onPacket(ctx, {}, stoppedLabel({ decision: "DENY", rule: "R2", templateId: "R2.revoked", stop: "S4", note: "revoked before the cart reached the engine" }), { packetStatus: "REVOKED" }),
  },
  { name: "not_revoked", build: (ctx) => onPacket(ctx, {}, approvedLabel({ note: "no revocation" })) },
  {
    name: "revoked_after_mint",
    build: (ctx) =>
      onPacket(ctx, {}, afterMintLabel({ note: "revoked after the mint and before first use: the card is voided and the charge declines", payment: { kind: "voided" }, rule: "R2", templateId: "R2.revoked", stop: "S4" }), {
        events: { revoke: "after_mint" },
      }),
  },
  {
    name: "revoked_after_use",
    build: (ctx) =>
      onPacket(ctx, {}, approvedLabel({ note: "revoked after first use: a used card is final [F2.cancel], nothing to void" }), { events: { revoke: "after_use" } }),
  },
];
