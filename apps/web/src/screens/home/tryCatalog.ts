// "Try asking": the booth scenarios (data/scenarios/booth.json) as plain-language cards in four groups. The presenter-only
// steps (mint, pay) are not here. Titles and one-line descriptions live in i18n/ui.ts under home.sc.<id>.
import type { ScenarioId } from "../../api/types";
import type { IconName } from "../../ui/icons";

export type TryGroup = "buy" | "stops" | "card" | "budget";
export type TryTone = "primary" | "stop" | "warn" | "accent" | "neutral";
/** Every booth scenario except the presenter's single steps. */
export type TryScenario = Exclude<ScenarioId, "mint" | "pay">;

export interface TryItem {
  readonly id: TryScenario;
  readonly group: TryGroup;
  readonly icon: IconName;
  readonly tone: TryTone;
}

export const TRY_GROUPS: readonly TryGroup[] = ["buy", "stops", "card", "budget"];

export const TRY_ITEMS: readonly TryItem[] = [
  { id: "normal", group: "buy", icon: "tag", tone: "primary" },
  { id: "small", group: "buy", icon: "tag", tone: "primary" },
  { id: "flagged", group: "stops", icon: "shieldAlert", tone: "stop" },
  { id: "overflow", group: "stops", icon: "receipt", tone: "stop" },
  { id: "injected", group: "stops", icon: "alert", tone: "stop" },
  { id: "off_category", group: "stops", icon: "hand", tone: "stop" },
  { id: "unverified", group: "stops", icon: "clock", tone: "warn" },
  { id: "overshoot", group: "card", icon: "card", tone: "accent" },
  { id: "replay", group: "card", icon: "refresh", tone: "accent" },
  { id: "wrong_merchant", group: "card", icon: "store", tone: "accent" },
  { id: "drift", group: "card", icon: "tag", tone: "accent" },
  { id: "timeout", group: "card", icon: "clock", tone: "accent" },
  { id: "revoke", group: "budget", icon: "lock", tone: "neutral" },
];

/** Scenarios whose result is on the Budget screen (cards and Cancel this budget), not on Wally. */
export const STAYS_ON_BUDGET: ReadonlySet<ScenarioId> = new Set<ScenarioId>(["revoke"]);
