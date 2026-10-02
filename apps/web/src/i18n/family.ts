// Family budget strings (Mum funds a ceiling, you give Wally a share). Additive: ui.ts spreads FAMILY_HOME into UI and
// exposes FAMILY as UI.family. Figures arrive already formatted; no digit lives here. Every zh-HK line is a draft and
// marked NEEDS-REVIEW for the native read.
import { label } from "./label";

/** The "Whose money?" choice in the Seal flow, the ceiling card, the cap message and the Budget tag. */
export const FAMILY = {
  whose: label("Whose money?", "用邊個的錢？"), // NEEDS-REVIEW
  own: label("My own budget", "我自己的預算"), // NEEDS-REVIEW
  mum: label("Mum's budget", "媽媽的預算"), // NEEDS-REVIEW
  /** {amount} and {until} are figures, {things} is the list of what Mum allows. */
  ceiling: label("Mum allows up to {amount} for {things} until {until}", "媽媽容許最多 {amount} 用於{things}，有效至 {until}"), // NEEDS-REVIEW
  ceilingNote: label("Wally's budget can never be more than Mum allows.", "Wally 的預算唔可以超過媽媽容許的上限。"), // NEEDS-REVIEW
  /** {cap} is the figure Mum allows. */
  overCap: label("That's more than Mum allows ({cap})", "超過媽媽容許的上限（{cap}）"), // NEEDS-REVIEW
  loading: label("Looking up what Mum allows", "查緊媽媽容許的上限"), // NEEDS-REVIEW
  unavailable: label("Can't reach Mum's budget right now. Your own budget still works.", "暫時連唔到媽媽的預算。你自己的預算仍然用得。"), // NEEDS-REVIEW
  fromMum: label("From Mum's budget", "來自媽媽的預算"), // NEEDS-REVIEW
  /** The server's refusal, worded here when the Seal screen cannot cap it up front. */
  refused: label("Mum's budget doesn't allow that. Nothing was sealed.", "媽媽的預算唔容許咁做，冇鎖定任何預算。"), // NEEDS-REVIEW
} as const;

/** "Try asking": the group and the two scenarios, only shown when the booth offers family budgets. */
export const FAMILY_HOME = {
  "home.group.family": label("Mum's budget", "媽媽的預算"), // NEEDS-REVIEW
  "home.sc.family_ok": label("Use Mum's budget", "用媽媽的預算"), // NEEDS-REVIEW
  "home.sc.family_ok.d": label("Mum allows a ceiling, you give Wally a share, and Wally buys a tee inside it.", "媽媽訂下上限，你分一份俾 Wally，Wally 喺範圍內買T恤。"), // NEEDS-REVIEW
  "home.sc.family_over": label("Ask for more than Mum allows", "要求超過媽媽容許的金額"), // NEEDS-REVIEW
  "home.sc.family_over.d": label("The budget is refused before anything is sealed. Your budget stays as it was.", "鎖定前已被拒絕，你的預算保持不變。"), // NEEDS-REVIEW
} as const;
