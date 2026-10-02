// The presenter's walk through the canonical demo (docs/00 DM1 to DM9, docs/06 Choreography). One Step = one beat.
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
  { moment: "DM1", title: label("Seal mandate M0", "封好授權 M0"), view: "seal", run: async (api) => void (await api.seal(m0Request(new Date()))) },
  { moment: "DM2", title: label("Mint the card", "發卡"), view: "booth", run: scenario("mint") },
  { moment: "DM2", title: label("The shop charges more", "商戶多收"), view: "booth", run: scenario("overshoot") },
  { moment: "DM2", title: label("Exact charge, then replay", "確實扣款，再重用"), view: "booth", run: async (api) => { await api.runScenario("pay"); await api.runScenario("replay"); } },
  { moment: "DM3", title: label("Flagged seller", "被標記的賣家"), view: "booth", run: scenario("flagged") },
  { moment: "DM4", title: label("Shipping overflow", "運費令總額超支"), view: "booth", run: scenario("overflow") },
  { moment: "DM5", title: label("Injected listing", "植入指令的商品頁"), view: "booth", run: scenario("injected") },
  { moment: "DM6", title: label("A clean cart still mints", "乾淨購物車照常發卡"), optional: true, view: "booth", run: scenario("small") },
  { moment: "DM7", title: label("Log, verify, tamper", "紀錄、驗證、竄改"), view: "log", run: async () => undefined },
  { moment: "DM8", title: label("Evidence", "證據"), view: "evidence", run: async () => undefined },
  { moment: "DM9", title: label("Where it breaks", "限制所在"), view: "limits", run: async () => undefined },
];
