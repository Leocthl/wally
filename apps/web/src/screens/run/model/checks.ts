// The "Why?" sheet's plain checks: five groups a shopper understands (budget, rules, seller, Wally's read of the
// listing, card limit), plus "your answer" and "checkout price" when those decided. Each group takes the latest
// decision in the chain that actually evaluated it, so a checkout stop (R12) still shows the budget check it passed.
import { isLanguageSkip } from "@wally/core/explain";
import type { Decision } from "../../../api/types";
import { formatHkd } from "../../../domain/money";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import type { Chain } from "./chain";

type Rule = Decision["rules"][number];
export type CheckStatus = "pass" | "stop" | "ask" | "skip";
export type CheckId = "budget" | "rules" | "seller" | "listing" | "card" | "answer" | "price";

export interface CheckRow {
  readonly id: CheckId;
  readonly name: LabelPair;
  readonly status: CheckStatus;
  readonly line: LabelPair;
}

const R = UI.run;

const GROUPS: readonly { readonly id: CheckId; readonly rules: readonly Rule["id"][]; readonly name: LabelPair; readonly onlyWhenFailed?: boolean }[] = [
  { id: "budget", rules: ["R3", "R4"], name: R.checkBudget },
  { id: "rules", rules: ["R1", "R2", "R6", "R7", "R8"], name: R.checkRules },
  { id: "seller", rules: ["R9"], name: R.checkSeller },
  { id: "listing", rules: ["R10"], name: R.checkListing },
  { id: "card", rules: ["R5"], name: R.checkCard },
  { id: "answer", rules: ["R11"], name: R.checkAnswer, onlyWhenFailed: true },
  { id: "price", rules: ["R12"], name: R.checkPrice, onlyWhenFailed: true },
];

function statusOf(rules: readonly Rule[]): CheckStatus {
  const failed = rules.filter((r) => r.result === "FAIL");
  if (failed.some((r) => r.verdict === "DENY")) return "stop";
  if (failed.length > 0) return "ask";
  return rules.every((r) => r.result === "SKIPPED") ? "skip" : "pass";
}

function money(inputs: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = inputs[key];
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? formatHkd(v) : undefined;
}

function firstFail(rules: readonly Rule[]): Rule | undefined {
  return rules.find((r) => r.result === "FAIL" && r.verdict === "DENY") ?? rules.find((r) => r.result === "FAIL");
}

function budgetLine(rules: readonly Rule[], status: CheckStatus): LabelPair {
  const r3 = rules.find((r) => r.id === "R3");
  const total = r3 ? money(r3.inputs, "total_minor") : undefined;
  const left = r3 ? money(r3.inputs, "remaining_minor") : undefined;
  if (status === "ask") return R.budgetAsk;
  if (status === "stop") {
    const fail = firstFail(rules);
    if (fail?.id === "R4") {
      const cap = money(fail.inputs, "cap_minor") ?? money(fail.inputs, "hard_cap_minor");
      return total && cap ? R.reasonR4Cap(total, cap) : R.rulesStop;
    }
    return total && left ? R.budgetOver(total, left) : R.rulesStop;
  }
  return total && left ? R.budgetFits(total, left) : R.rulesPass;
}

const RULES_STOP: Readonly<Record<string, LabelPair>> = { R1: R.reasonR1, R6: R.rulesStop, R7: R.reasonR7, R8: R.reasonR8 };

function rulesLine(rules: readonly Rule[], status: CheckStatus): LabelPair {
  if (status !== "stop") return R.rulesPass;
  const fail = firstFail(rules);
  if (fail?.id === "R2") return fail.template_id === "R2.revoked" ? R.reasonR2Revoked : R.reasonR2Expired;
  return (fail ? RULES_STOP[fail.id] : undefined) ?? R.rulesStop;
}

const LISTING: Readonly<Record<string, LabelPair>> = {
  "R10.injection": R.listingInjection,
  injection_risk: R.listingInjection,
  "R10.seller_risk": R.listingSeller,
  seller_risk: R.listingSeller,
  "R10.scope": R.listingScope,
  scope_fit: R.listingScope,
  "R10.escalate": R.listingUnsure,
  escalate_or_proceed: R.listingUnsure,
  "R10.unavailable": R.listingOffline,
  judge_status: R.listingOffline,
};

function listingLine(rules: readonly Rule[], status: CheckStatus): LabelPair {
  if (status === "pass") return R.listingPass;
  const fail = firstFail(rules);
  if (fail?.template_id === "R10.unavailable" && isLanguageSkip(fail.inputs)) return R.listingLanguage;
  return (fail ? (LISTING[fail.template_id ?? ""] ?? LISTING[fail.check ?? ""]) : undefined) ?? R.listingUnsure;
}

function lineFor(id: CheckId, rules: readonly Rule[], status: CheckStatus): LabelPair {
  if (status === "skip") return R.skipped;
  switch (id) {
    case "budget":
      return budgetLine(rules, status);
    case "rules":
      return rulesLine(rules, status);
    case "seller":
      return status === "pass" ? R.sellerPass : status === "stop" ? R.sellerStop : R.sellerAsk;
    case "listing":
      return listingLine(rules, status);
    case "card":
      return status === "pass" ? R.cardPass : R.cardStop;
    case "answer":
      return firstFail(rules)?.inputs["choice"] === "DENY" ? R.youSaidNo : R.answerStop;
    case "price":
      return R.priceStop;
  }
}

/** The group's rules from the newest decision of the chain that evaluated them (not all SKIPPED). */
function evaluated(chain: Chain, ids: readonly Rule["id"][]): readonly Rule[] {
  for (const decision of [...chain.decisions].reverse()) {
    const rules = decision.rules.filter((r) => ids.includes(r.id));
    if (rules.some((r) => r.result !== "SKIPPED")) return rules;
  }
  return chain.current.rules.filter((r) => ids.includes(r.id));
}

export function checksFor(chain: Chain): readonly CheckRow[] {
  return GROUPS.flatMap((group) => {
    const rules = evaluated(chain, group.rules);
    const status = statusOf(rules);
    if (group.onlyWhenFailed && status !== "stop" && status !== "ask") return [];
    if (rules.length === 0) return [];
    return [{ id: group.id, name: group.name, status, line: lineFor(group.id, rules, status) }];
  });
}
