// What a "Stopped before paying" screen shows, as one pure view of a result: the lead sentence (how a question ended,
// else the rule's own plain reason), the quiet rule name, the cart, and whether a top-up can help. Several layouts
// (the screen and the dev-only variants) read this, so the words never differ between them.
import type { Cart, Decision } from "../../../api/types";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { plainReason, ruleChip, templateOf } from "./reason";
import type { Answer, Result } from "./screen";

const R = UI.run;

/** Budget stops (R3, R4): a top-up can help. Anything else: ask for something different. */
export function isBudgetStop(decision: Decision): boolean {
  const rule = templateOf(decision)?.split(".")[0];
  return rule === "R3" || rule === "R4";
}

/** The lead sentence: how a question ended, when it did; else the rule's own plain reason. */
export function leadFor(answer: Answer | undefined, decision: Decision): { readonly lead: LabelPair; readonly reason?: LabelPair } {
  if (answer === "no") return { lead: R.youSaidNo };
  // A question the budget outlived: said as it is, with the reason it was asked kept under it.
  if (answer === "cancelled") return { lead: R.questionClosedCancelled, reason: plainReason(decision) };
  if (answer === "ended") return { lead: R.questionClosedEnded, reason: plainReason(decision) };
  if (answer === "expired") return { lead: R.nobodyAnswered };
  if (answer === "yesButRule") return { lead: R.hardRuleAnyway, reason: plainReason(decision) };
  return { lead: plainReason(decision) };
}

export interface StopView {
  readonly decision: Decision;
  readonly cart: Cart;
  readonly lead: LabelPair;
  readonly reason?: LabelPair;
  readonly chip?: LabelPair;
  /** A top-up can help (R3, R4). */
  readonly budget: boolean;
  /** The person's own rules decided it (R6: a category or a shop they did not allow), so editing them can help. */
  readonly editRules: boolean;
  /** A card had been made and was cancelled (a price change at checkout). */
  readonly cancelled: boolean;
}

export function stopView(result: Result): StopView | null {
  const decision = result.chain?.current;
  if (!decision) return null;
  const { lead, reason } = leadFor(result.answer, decision);
  const chip = ruleChip(decision);
  return {
    decision,
    cart: decision.cart,
    lead,
    ...(reason ? { reason } : {}),
    ...(chip ? { chip } : {}),
    budget: isBudgetStop(decision),
    editRules: templateOf(decision)?.startsWith("R6.") === true,
    cancelled: result.card !== undefined,
  };
}
