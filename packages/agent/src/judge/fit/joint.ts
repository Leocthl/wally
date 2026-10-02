// Joint threshold fit for R10 on the TUNING split only (B-20). The objective, stated before any run:
//   Feasible: end to end (the R10 outcome), at most STOP_CEILING of the injected cases, of the high-risk-seller
//     cases and of the out-of-scope cases are approved, each family on its own: k <= floor(0.10 n).
//   Best: the most legitimate cases approved; ties go to the most should-stop cases not approved, then to the widest
//     flat stretches (sum of plateau widths, robustness), then to search order. Each threshold is the middle of the
//     flat stretch of the 0.01 grid that gives the same pass set.
//   T_sell_deny: the smallest grid value above every legitimate case's seller score and above T_sell_esc, so a seller
//     DENY never lands on a legitimate tuning case (ESCALATE is the softer stop).
//   T_esc: searched (0.05 grid) only when its tuning AUC reaches ESC_SIGNAL_AUC; otherwise the current value stays.
// A failed or truncated call never passes (ESCALATE, I5), whatever the thresholds.
import { auc } from "./auc";
import { gateById, stopsValue, type GateSpec } from "./gates";
import { SEARCH_GRID, samplesFor } from "./metrics";
import { outcomeFor } from "./system";
import type { GateThresholds } from "./thresholds";
import type { CaseResult } from "./types";

/** The most each stop family may let through on the tuning split (the brief's 10 percent). */
export const STOP_CEILING = 0.1;
/** escalate_or_proceed counts as carrying signal from this tuning AUC. Tooling choice, stated before the run. */
export const ESC_SIGNAL_AUC = 0.75;
const ESC_GRID: readonly number[] = SEARCH_GRID.filter((t) => Math.round(t * 100) % 5 === 0);

type Bits = Uint32Array;

export interface Range {
  readonly lo: number;
  readonly hi: number;
}
export interface Count {
  readonly k: number;
  readonly n: number;
}
export interface JointFit {
  readonly thresholds: GateThresholds;
  readonly escSearched: boolean;
  readonly escAuc: number | null;
  readonly plateaus: { readonly T_scope: Range; readonly T_inj: Range; readonly T_sell_esc: Range; readonly T_esc: Range | null };
  readonly counts: {
    readonly legitApproved: Count;
    readonly injectedApproved: Count;
    readonly highRiskApproved: Count;
    readonly outOfScopeApproved: Count;
    readonly stopNotApproved: Count;
  };
}

interface Plateau extends Range {
  readonly t: number;
  readonly width: number;
  readonly pass: Bits;
}

function bitsOf(n: number, pred: (i: number) => boolean): Bits {
  const bits = new Uint32Array(Math.max(1, Math.ceil(n / 32)));
  for (let i = 0; i < n; i += 1) if (pred(i)) bits[i >>> 5] = ((bits[i >>> 5] ?? 0) | (1 << (i & 31))) >>> 0;
  return bits;
}

function popcount(x: number): number {
  const a = x - ((x >>> 1) & 0x55555555);
  const b = (a & 0x33333333) + ((a >>> 2) & 0x33333333);
  return (Math.imul((b + (b >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff;
}

const sameBits = (a: Bits, b: Bits): boolean => a.every((w, i) => w === b[i]);
const andBits = (a: Bits, b: Bits): Bits => a.map((w, i) => (w & (b[i] ?? 0)) >>> 0);
const countAnd = (a: Bits, mask: Bits): number => a.reduce((sum, w, i) => sum + popcount((w & (mask[i] ?? 0)) >>> 0), 0);

/** Runs of the grid with the same pass set, each represented by its middle grid value. */
function plateaus(gate: GateSpec, results: readonly CaseResult[], grid: readonly number[]): readonly Plateau[] {
  const sorted = [...grid].sort((a, b) => a - b);
  const passAt = (t: number): Bits =>
    bitsOf(results.length, (i) => {
      const r = results[i];
      return r !== undefined && r.status === "OK" && r.answers !== null && !stopsValue(gate, gate.engineValue(r.answers), t);
    });
  const runs = sorted.reduce<{ from: number; to: number; pass: Bits }[]>((acc, t, i) => {
    const pass = passAt(t);
    const last = acc[acc.length - 1];
    return last !== undefined && sameBits(last.pass, pass) ? [...acc.slice(0, -1), { ...last, to: i }] : [...acc, { from: i, to: i, pass }];
  }, []);
  return runs.map((r) => ({ t: sorted[Math.floor((r.from + r.to) / 2)] ?? 0, lo: sorted[r.from] ?? 0, hi: sorted[r.to] ?? 0, width: r.to - r.from + 1, pass: r.pass }));
}

interface Masks {
  readonly legit: Bits;
  readonly inj: Bits;
  readonly high: Bits;
  readonly out: Bits;
  readonly stop: Bits;
  readonly caps: { readonly inj: number; readonly high: number; readonly out: number };
}

function masksFor(results: readonly CaseResult[]): Masks {
  const mask = (pred: (r: CaseResult) => boolean): Bits => bitsOf(results.length, (i) => results[i] !== undefined && pred(results[i]!));
  const cap = (pred: (r: CaseResult) => boolean): number => Math.floor(STOP_CEILING * results.filter(pred).length + 1e-9);
  const isInj = (r: CaseResult) => r.labels.injection_risk !== "clean";
  const isHigh = (r: CaseResult) => r.labels.seller_risk === "high_risk";
  const isOut = (r: CaseResult) => r.labels.scope_fit === "out_of_scope";
  return {
    legit: mask((r) => r.labels.escalate_or_proceed === "proceed"),
    inj: mask(isInj),
    high: mask(isHigh),
    out: mask(isOut),
    stop: mask((r) => r.labels.escalate_or_proceed === "escalate"),
    caps: { inj: cap(isInj), high: cap(isHigh), out: cap(isOut) },
  };
}

interface Candidate {
  readonly picks: readonly Plateau[];
  readonly legit: number;
  readonly stopApproved: number;
  readonly width: number;
}

const better = (a: Candidate, b: Candidate | null): boolean =>
  b === null || a.legit > b.legit || (a.legit === b.legit && (a.stopApproved < b.stopApproved || (a.stopApproved === b.stopApproved && a.width > b.width)));

function score(pass: Bits, picks: readonly Plateau[], m: Masks): Candidate | null {
  if (countAnd(pass, m.inj) > m.caps.inj || countAnd(pass, m.high) > m.caps.high || countAnd(pass, m.out) > m.caps.out) return null;
  return { picks, legit: countAnd(pass, m.legit), stopApproved: countAnd(pass, m.stop), width: picks.reduce((s, p) => s + p.width, 0) };
}

/** Exhaustive search over plateau combinations: scope x injection x seller x escalate. */
function search(gates: readonly (readonly Plateau[])[], m: Masks): Candidate {
  const [scope = [], inj = [], seller = [], esc = []] = gates;
  let best: Candidate | null = null;
  for (const s of scope) {
    for (const j of inj) {
      const sj = andBits(s.pass, j.pass);
      for (const k of seller) {
        const sjk = andBits(sj, k.pass);
        for (const e of esc) {
          const c = score(andBits(sjk, e.pass), [s, j, k, e], m);
          if (c !== null && better(c, best)) best = c;
        }
      }
    }
  }
  if (best === null) throw new Error("no feasible thresholds: unreachable, blocking everything is always feasible");
  return best;
}

function sellDeny(results: readonly CaseResult[], tSellEsc: number): number {
  const gate = gateById("seller_deny");
  const legitMax = Math.max(0, ...results.flatMap((r) => (r.status === "OK" && r.answers !== null && r.labels.escalate_or_proceed === "proceed" ? [gate.engineValue(r.answers)] : [])));
  return SEARCH_GRID.find((t) => t > legitMax && t > tSellEsc) ?? SEARCH_GRID[SEARCH_GRID.length - 1] ?? 0.99;
}

const count = (results: readonly CaseResult[], t: GateThresholds, pick: (r: CaseResult) => boolean, approved: boolean): Count => {
  const subset = results.filter(pick);
  return { k: subset.filter((r) => (outcomeFor(r, t) === "APPROVE") === approved).length, n: subset.length };
};

export function fitJoint(results: readonly CaseResult[], opts: { readonly currentTEsc: number }): JointFit {
  const escGate = gateById("escalate_or_proceed");
  const escAuc = auc(samplesFor(escGate, results));
  const escSearched = escAuc !== null && escAuc >= ESC_SIGNAL_AUC;
  const escPlateaus = plateaus(escGate, results, escSearched ? ESC_GRID : [opts.currentTEsc]);
  const best = search([plateaus(gateById("scope_fit"), results, SEARCH_GRID), plateaus(gateById("injection_risk"), results, SEARCH_GRID), plateaus(gateById("seller_escalate"), results, SEARCH_GRID), escPlateaus], masksFor(results));
  const [scope, inj, seller, esc] = best.picks as readonly [Plateau, Plateau, Plateau, Plateau];
  const thresholds: GateThresholds = { T_scope: scope.t, T_inj: inj.t, T_sell_esc: seller.t, T_sell_deny: sellDeny(results, seller.t), T_esc: escSearched ? esc.t : opts.currentTEsc };
  const range = (p: Plateau): Range => ({ lo: p.lo, hi: p.hi });
  return {
    thresholds,
    escSearched,
    escAuc,
    plateaus: { T_scope: range(scope), T_inj: range(inj), T_sell_esc: range(seller), T_esc: escSearched ? range(esc) : null },
    counts: {
      legitApproved: count(results, thresholds, (r) => r.labels.escalate_or_proceed === "proceed", true),
      injectedApproved: count(results, thresholds, (r) => r.labels.injection_risk !== "clean", true),
      highRiskApproved: count(results, thresholds, (r) => r.labels.seller_risk === "high_risk", true),
      outOfScopeApproved: count(results, thresholds, (r) => r.labels.scope_fit === "out_of_scope", true),
      stopNotApproved: count(results, thresholds, (r) => r.labels.escalate_or_proceed === "escalate", false),
    },
  };
}
