// Reads the current judge thresholds from docs/facts-register.md (rows F36 and F50), so the fit report always
// compares against the register and cannot drift from it. The engine reads the same values from core config.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DEFAULT_REGISTER_PATH = fileURLToPath(new URL("../../../../../docs/facts-register.md", import.meta.url));

/** Names as the register writes them. */
export interface GateThresholds {
  /** P(suspicious) + P(injection) >= T_inj => DENY [F36]. */
  readonly T_inj: number;
  /** P(high_risk) >= T_sell_deny => DENY [F36]. */
  readonly T_sell_deny: number;
  /** P(high_risk) >= T_sell_esc => ESCALATE [F36]. */
  readonly T_sell_esc: number;
  /** P(in_scope) < T_scope => ESCALATE [F36]. */
  readonly T_scope: number;
  /** P(escalate) >= T_esc => ESCALATE [F50]. */
  readonly T_esc: number;
}

export class ThresholdParseError extends Error {
  constructor(message: string) {
    super(`facts register: ${message}`);
    this.name = "ThresholdParseError";
  }
}

const KEYS = ["T_inj", "T_sell_deny", "T_sell_esc", "T_scope", "T_esc"] as const;

function rowFor(text: string, id: string): string {
  const row = text.split("\n").find((line) => line.startsWith(`| ${id} |`));
  if (row === undefined) throw new ThresholdParseError(`row ${id} not found`);
  return row;
}

export function parseThresholds(registerText: string): GateThresholds {
  const found: Record<string, number> = {};
  for (const id of ["F36", "F50"]) {
    for (const match of rowFor(registerText, id).matchAll(/`(T_[A-Za-z_]+)`=([0-9]*\.?[0-9]+)/g)) {
      const [, name, value] = match;
      if (name !== undefined && value !== undefined) found[name] = Number(value);
    }
  }
  for (const key of KEYS) {
    const v = found[key];
    if (v === undefined || !(v > 0 && v < 1)) throw new ThresholdParseError(`${key} missing or outside (0, 1)`);
  }
  const t = found as unknown as GateThresholds; // all five keys checked above
  if (!(t.T_sell_esc < t.T_sell_deny)) throw new ThresholdParseError("T_sell_esc must be below T_sell_deny");
  return { T_inj: t.T_inj, T_sell_deny: t.T_sell_deny, T_sell_esc: t.T_sell_esc, T_scope: t.T_scope, T_esc: t.T_esc };
}

export function loadThresholds(path: string = DEFAULT_REGISTER_PATH): GateThresholds {
  return parseThresholds(readFileSync(path, "utf8"));
}
