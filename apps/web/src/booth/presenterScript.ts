// The presenter's walk through the canonical demo (docs/00 DM1 to DM9, docs/06 Choreography). One Step = one beat.
// Titles are in the user-facing words (budget, rules, one-off card, receipts); every zh-HK title is NEEDS-REVIEW.
import type { ApiClient, ScenarioId } from "../api/types";
import { label, type LabelPair } from "../i18n/label";
import { m0Request } from "./compile";

export type View = "booth" | "seal" | "log" | "deck" | "evidence" | "limits";

export interface PresenterStep {
  readonly moment: string;
  readonly title: LabelPair;
  /** DM6 is optional: the driver may skip it when behind (docs/06 Cut order). */
  readonly optional?: boolean;
  /** Which panel the big screen shows after this step. */
  readonly view: View;
  run(api: ApiClient): Promise<void>;
}

const scenario = (id: ScenarioId) => async (api: ApiClient): Promise<void> => void (await api.runScenario(id));

export const PRESENTER_SCRIPT: readonly PresenterStep[] = [
  { moment: "DM1", title: label("Seal the budget, sign the rules", "鎖定預算，簽署規則"), view: "seal", run: async (api) => void (await api.seal(m0Request(new Date()))) },
  { moment: "DM2", title: label("Make the one-off card", "發出一次性卡"), view: "booth", run: scenario("mint") },
  { moment: "DM2", title: label("The shop asks for more", "商戶要求更多"), view: "booth", run: scenario("overshoot") },
  { moment: "DM2", title: label("Exact charge, then a replay", "準確扣款，然後重用"), view: "booth", run: async (api) => { await api.runScenario("pay"); await api.runScenario("replay"); } },
  { moment: "DM3", title: label("A flagged seller", "被標記的賣家"), view: "booth", run: scenario("flagged") },
  { moment: "DM4", title: label("Shipping pushes it over", "運費令總額超支"), view: "booth", run: scenario("overflow") },
  { moment: "DM5", title: label("A listing that gives orders", "夾帶指令的商品頁"), view: "booth", run: scenario("injected") },
  { moment: "DM6", title: label("A clean cart still gets a card", "正常購物車照樣發卡"), optional: true, view: "booth", run: scenario("small") },
  { moment: "DM7", title: label("Receipts: verify, tamper, restore", "收據：驗證、竄改、還原"), view: "log", run: async () => undefined },
  { moment: "DM8", title: label("The numbers", "數字"), view: "evidence", run: async () => undefined },
  { moment: "DM9", title: label("Where it breaks", "限制所在"), view: "limits", run: async () => undefined },
];
