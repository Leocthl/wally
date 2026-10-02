// GET /api/info: which judge and planner run, whether outputs are recorded (replayed), whether Laya answered the
// warm-up, where the demo keys come from, and the delegator-key DEMO SHORTCUT, said plainly.
import type { ApiInfo } from "../../src/api/types";
import { BRAND } from "../../src/brand";
import type { BoothSettings } from "./settings";

export type JudgeHealth =
  | { readonly state: "not_applicable" | "warming" }
  | { readonly state: "ready" | "down"; readonly latencyMs: number };

/** ApiInfo plus fields the UI does not read yet; still assignable to ApiInfo. */
export interface ServerInfo extends ApiInfo {
  readonly product: string;
  readonly demoShortcut: string;
  readonly keys: string;
  readonly judgeHealth: JudgeHealth["state"];
}

export interface InfoInput {
  readonly settings: BoothSettings;
  readonly judgeProvider: ApiInfo["judge"]["provider"];
  readonly health: JudgeHealth;
  readonly keySource: "KEY_DIR" | "ephemeral";
}

function judgeNote(input: InfoInput): string {
  const { settings, health } = input;
  const mode = settings.judgeEnv["JUDGE_MODE"] === "shadow" ? " Shadow mode: the judge is recorded but never blocks." : "";
  if (input.judgeProvider === "replay") {
    return `Recorded judge answers (SIMULATED), chosen by the operator (JUDGE_PROVIDER=replay). Text with no recording, such as typed text, ESCALATEs (R10.unavailable).${mode}`;
  }
  if (input.judgeProvider === "jev") return `Hosted Jev (optional backend).${mode}`;
  const where = `Laya (typed-decisions) on this machine at ${settings.judgeEnv["LAYA_BASE_URL"] ?? "127.0.0.1:8808"}`;
  if (health.state === "ready") return `${where}; warm-up answered in ${Math.round(health.latencyMs)} ms, MEASURED(n=1).${mode}`;
  if (health.state === "down") {
    return `${where} did not answer the warm-up: every decision ESCALATEs (R10.unavailable) until it is back. Restart services/laya/serve.sh, then press Reset.${mode}`;
  }
  return `${where}; warming up (the first call after a start is slow).${mode}`;
}

function plannerNote(provider: "rule" | "replay"): string {
  return provider === "replay"
    ? "Recorded planner proposals (SIMULATED), chosen by the operator (PLANNER_PROVIDER=replay)."
    : "Laya decision loop over structured listing fields; the planner never reads the description and holds no key (I4).";
}

export function buildInfo(input: InfoInput): ServerInfo {
  const planner = input.settings.plannerProvider;
  return {
    kind: "http",
    judge: { provider: input.judgeProvider, note: judgeNote(input) },
    planner: { provider: planner, note: plannerNote(planner) },
    replayed: input.judgeProvider === "replay" || planner === "replay",
    realCapture: null,
    product: BRAND.name,
    demoShortcut: `DEMO SHORTCUT: this ${BRAND.name} server holds the delegator's throwaway key and signs the seal, revocations and escalation answers on the shopper's behalf. A real deployment keeps that key on the shopper's device.`,
    keys: input.keySource === "KEY_DIR" ? "Throwaway demo keys from KEY_DIR (pnpm keys:gen)." : "No keys in KEY_DIR: ephemeral in-memory demo keys, new on every start. Run pnpm keys:gen to keep them.",
    judgeHealth: input.health.state,
  };
}
