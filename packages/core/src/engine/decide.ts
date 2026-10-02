// engine.decide (A-15): pure and deterministic over recorded inputs; the only producer of a Decision.
// Runs R1-R12 in order, applies an escalation answer when one resolves an earlier ESCALATE, and never
// reads a clock or does I/O. Malformed judge records and missing proof flags fail closed (I5).
import { ENGINE_CONFIG, pinConfig, validateEngineConfig, type EngineConfig } from "../config";
import type { Cart, Decision, Escalation, Mandate, PacketState, RuleResult } from "../generated";
import type { DecideContext, Engine, EscalationResolution, JudgeRecord } from "../ports";
import {
  evaluateR1,
  evaluateR2,
  evaluateR3,
  evaluateR4,
  evaluateR5,
  evaluateR6,
  evaluateR7,
  evaluateR8,
  evaluateR9,
  evaluateR10,
  evaluateR11,
  skipped,
  timeOf,
  type R11Outcome,
} from "../rules";
import { assembleDecision, outcomeOf } from "./assemble";
import { bindingProblem, refusedR11 } from "./binding";
import { checkoutDecision, type CheckoutInput } from "./checkout";
import { configSha256 } from "./hash";
import { resolveRules, resolvedEscalation } from "./resolution";
import pkg from "../../package.json" with { type: "json" };

/** Default engine.version: package version; composers append the git commit via createEngine({ version }). */
export const ENGINE_VERSION = `core@${pkg.version}`;

export class EngineConfigError extends Error {
  constructor(issues: readonly string[]) {
    super(`invalid engine config: ${issues.join(", ")}`);
    this.name = "EngineConfigError";
  }
}

export interface EngineOptions {
  /** Thresholds in force; default ENGINE_CONFIG (register-pinned). Validated at construction. */
  readonly config?: EngineConfig;
  readonly version?: string;
}

export interface LaiseeEngine extends Engine {
  readonly version: string;
  readonly config: EngineConfig;
  readonly configSha256: string;
  /** R12 at checkout: null when the approval stands, else a DENY that resolves it (void the card). */
  decideCheckout(input: CheckoutInput): Decision | null;
}

interface DecideArgs {
  readonly mandate: Mandate;
  readonly packet: PacketState;
  readonly cart: Cart;
  readonly judge: JudgeRecord;
  readonly now: Date;
  readonly resolution: EscalationResolution | undefined;
  readonly ctx: DecideContext | undefined;
}

function preflightAndJudge(config: EngineConfig, a: DecideArgs): RuleResult[] {
  const { mandate, packet, cart, now } = a;
  return [
    evaluateR1({ mandate, packet, cart, proofValid: a.ctx?.mandateProofValid }),
    evaluateR2({ mandate, packet, now }),
    evaluateR3({ cart, packet }),
    evaluateR4({ mandate, packet, cart }),
    evaluateR5({ cart, config }),
    evaluateR6({ mandate, cart }),
    evaluateR7({ mandate, packet, now, config }),
    evaluateR8({ packet, config }),
    evaluateR9({ mandate, cart, now, config }),
    ...evaluateR10({ mandate, judge: a.judge, config }),
  ];
}

/** decided_at: `now`, or the cart's proposed_at when the clock is invalid (R2 then denies). */
function decidedAtOf(a: DecideArgs): string {
  const ms = timeOf(a.now);
  return ms === null ? a.cart.proposed_at : new Date(ms).toISOString();
}

/** R11 (answer binding and timing), then the resolution binding (escalated decision, cart fingerprint, answer signature): any failure => DENY R11. */
function r11Of(config: EngineConfig, a: DecideArgs): R11Outcome {
  const base = evaluateR11({ mandate: a.mandate, packet: a.packet, cart: a.cart, resolution: a.resolution, now: a.now, config });
  if (a.resolution === undefined) return base;
  const problem = bindingProblem(a.resolution, a.cart, a.ctx);
  return problem === null ? base : refusedR11(base, a.resolution, problem);
}

function decideWith(config: EngineConfig, meta: Decision["engine"], a: DecideArgs): Decision {
  const decidedAt = decidedAtOf(a);
  const r11 = r11Of(config, a);
  const rules = [...resolveRules(preflightAndJudge(config, a), r11), skipped("R12")];
  const outcome = outcomeOf(rules);
  const escalation: Escalation | undefined =
    a.resolution !== undefined
      ? resolvedEscalation(r11, outcome)
      : outcome === "ESCALATE"
        ? { state: "OPEN", expires_at: new Date(Date.parse(decidedAt) + config.escalation.window_ms).toISOString() } // [F31]
        : undefined;
  return assembleDecision({
    phase: "decide",
    mandate: a.mandate,
    packet: a.packet,
    cart: a.cart,
    judge: a.judge,
    decidedAt,
    rules,
    ...(a.resolution === undefined ? {} : { resolves: a.resolution.resolves }),
    ...(escalation === undefined ? {} : { escalation }),
    engine: meta,
  });
}

/** An engine bound to one frozen config. Throws EngineConfigError on an invalid config (fail fast). */
export function createEngine(options: EngineOptions = {}): LaiseeEngine {
  const config = options.config ?? ENGINE_CONFIG;
  const issues = validateEngineConfig(config);
  if (issues.length > 0) throw new EngineConfigError(issues);
  const pinned = pinConfig(config);
  const meta: Decision["engine"] = { version: options.version ?? ENGINE_VERSION, config_sha256: configSha256(pinned) };
  return {
    version: meta.version,
    config: pinned,
    configSha256: meta.config_sha256,
    decide: (mandate, packet, cart, judge, now, resolution, ctx) =>
      decideWith(pinned, meta, { mandate, packet, cart, judge, now, resolution, ctx }),
    decideCheckout: (input) => checkoutDecision(meta, input),
  };
}
