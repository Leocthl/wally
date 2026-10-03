// Where a visitor is in setup (steps one to three), kept above the booth connection so that "Try again" after a failed load
// (which starts the booth connection over) does not send them back to Hello. Types only: the provider holds the value.
import type { Profile } from "../../state/profile";
import type { BudgetDraft } from "./budgetModel";

export type SetupStep = "hello" | "taste" | "budget";

export interface SetupProgress {
  readonly step: SetupStep;
  /** Typed on Hello, not saved until the step is left. */
  readonly nickname: string;
  readonly taste: Profile;
  /** The budget form, with the shopping choice it was started from (it starts over if that changes). */
  readonly budget: { readonly seed: string; readonly draft: BudgetDraft } | null;
}
