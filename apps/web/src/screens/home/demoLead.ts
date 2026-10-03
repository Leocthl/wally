// The line under "Demo scenarios": the cards run the demo shop's clothes, so a budget that leaves clothes out says the rules may stop
// them. The scenarios are the same, only the sentence changes. Pure.
import type { LabelPair } from "../../i18n/label";
import { OB } from "../../i18n/onboarding";

/** `categories` is the sealed budget's; undefined while no budget is known (the usual line then). */
export function demoLeadFor(categories: readonly string[] | undefined, personal: boolean): LabelPair {
  if (categories !== undefined && !categories.includes("apparel")) return OB.home.demoLeadOutside;
  return personal ? OB.home.tryLead : OB.home.demoLead;
}
