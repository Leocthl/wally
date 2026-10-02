// @laisee/core/engine (A-15): the policy engine. Node-only (node:crypto for ids and config_sha256).
import { createEngine } from "./decide";

/** Default engine bound to the register-pinned ENGINE_CONFIG. */
export const engine = createEngine();

export { createEngine, ENGINE_VERSION, EngineConfigError, type EngineOptions, type LaiseeEngine } from "./decide";
export { type CheckoutInput } from "./checkout";
export { canonicalJson, cartFingerprint, configSha256, sha256Hex } from "./hash";
export { isDecisionId } from "./ids";
export { outcomeOf, primaryReason } from "./assemble";
