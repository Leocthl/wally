// Where a visitor is in setup (steps one to three), kept above the booth connection so that "Try again" after a failed load
// (which starts the booth connection over) does not send them back to Hello. Types only: the provider holds the value.
import type { ShopId } from "../../state/shopping";
import type { BudgetDraft } from "./budgetModel";

export type SetupStep = "hello" | "buy" | "budget";

export interface SetupProgress {
  readonly step: SetupStep;
  /** Typed on Hello, not saved until the step is left. */
  readonly nickname: string;
  /** The kinds of purchase ticked on step two, as they stand now (all four until the person unticks one). */
  readonly ticked: readonly ShopId[];
  /** The budget form, with the shopping choice it was started from (it starts over if that changes). */
  readonly budget: { readonly seed: string; readonly draft: BudgetDraft } | null;
}
