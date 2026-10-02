// A-01 stub engine: fails closed (I5) with a schema-valid DENY that cites R1, so lanes can wire
// planner -> judge -> engine -> log -> rail before the real rules exist. Lane A replaces decide().
import type { Cart, Decision, Mandate, PacketState } from "../generated";
import type { Engine, EscalationResolution, JudgeRecord } from "../ports";

export const STUB_ENGINE_VERSION = "core@0.0.0+stub";
/** Placeholder until config.ts pins thresholds: SHA-256 hex of nothing in particular, all zeros. */
export const STUB_CONFIG_SHA256 = "0".repeat(64);

const ID_BODY_MAX = 40;

function decisionId(cart: Cart, now: Date): string {
  const body = `${cart.id.slice("crt_".length)}${now.getTime().toString(36)}`.replace(/[^A-Za-z0-9]/g, "");
  return `dec_${body.slice(-ID_BODY_MAX)}`;
}

function stubDecide(
  mandate: Mandate,
  packet: PacketState,
  cart: Cart,
  judge: JudgeRecord,
  now: Date,
  _resolution?: EscalationResolution,
): Decision {
  const inputs = { stub: true, signer: mandate.delegator };
  return {
    id: decisionId(cart, now),
    mandate_id: mandate.id,
    cart,
    decided_at: now.toISOString(),
    outcome: "DENY",
    packet,
    rules: [
      {
        id: "R1",
        result: "FAIL",
        verdict: "DENY",
        inputs,
        comparator: "verify",
        template_id: "R1.invalid_signature",
      },
    ],
    judge,
    explanation: {
      template_id: "R1.invalid_signature",
      inputs,
      rendered: "Stopped by R1. Engine stub: rules not built yet, so every cart is refused.",
    },
    engine: { version: STUB_ENGINE_VERSION, config_sha256: STUB_CONFIG_SHA256 },
  };
}

export const engine: Engine = { decide: stubDecide };
