// The presets a judge can press (lane C brief) and the presenter's DM walk (docs/06 Choreography).
import type { ScenarioId } from "../api/types";
import { label, type LabelPair } from "../i18n/label";

export type ScenarioGroup = "buy" | "stops" | "rail" | "mandate";

export interface ScenarioMeta {
  readonly id: ScenarioId;
  readonly group: ScenarioGroup;
  readonly label: LabelPair;
  readonly hint: LabelPair;
}

export const GROUP_TITLES: Readonly<Record<ScenarioGroup, LabelPair>> = {
  buy: label("Buy", "購買"),
  stops: label("Stops", "攔截"),
  rail: label("Rail", "發卡層"),
  mandate: label("Mandate", "授權"),
};

export const PICKER: readonly ScenarioMeta[] = [
  { id: "normal", group: "buy", label: label("Normal purchase", "一般購買"), hint: label("A tee inside the packet: mint, then the exact charge", "封包內的 T 恤：發卡，再按確實金額扣款") },
  { id: "small", group: "buy", label: label("Second purchase", "第二次購買"), hint: label("A clean small cart still mints", "乾淨的小額購物車照常發卡") },
  { id: "flagged", group: "stops", label: label("Flagged seller", "被標記的賣家"), hint: label("R9 stops it, the card never exists", "R9 攔截，卡從未產生") },
  { id: "overflow", group: "stops", label: label("Shipping overflow", "運費令總額超支"), hint: label("Shipping tips the total over what is left: R3", "運費令總額超出餘額：R3") },
  { id: "injected", group: "stops", label: label("Injected listing", "植入指令的商品頁"), hint: label("The listing gives orders: R10", "商品頁夾帶指令：R10") },
  { id: "unverified", group: "stops", label: label("Unverified seller", "未核實賣家"), hint: label("R9 asks you; unanswered, R11 stops it", "R9 詢問你；逾時未覆則由 R11 攔截") },
  { id: "overshoot", group: "rail", label: label("Shop charges more", "商戶多收"), hint: label("The rail declines, the limit holds", "發卡層拒絕，額度不變") },
  { id: "replay", group: "rail", label: label("Replay the card", "重用同一張卡"), hint: label("A used card is declined", "已用的卡會被拒絕") },
  { id: "wrong_merchant", group: "rail", label: label("Wrong merchant", "錯誤商戶"), hint: label("The merchant lock declines (SIMULATED lock)", "商戶鎖拒絕（模擬鎖）") },
  { id: "drift", group: "rail", label: label("Price drift", "價格改變"), hint: label("R12 voids the approval and the card", "R12 令批准失效並作廢卡") },
  { id: "timeout", group: "rail", label: label("Rail timeout", "發卡層逾時"), hint: label("The retry charges only once", "重試只會扣款一次") },
  { id: "revoke", group: "mandate", label: label("Revoke", "撤銷"), hint: label("Mint a card, then hold to revoke it", "先發一張卡，再按住撤銷") },
];

export const GROUP_ORDER: readonly ScenarioGroup[] = ["buy", "stops", "rail", "mandate"];

/** Mock-mode ceiling on typed text, far above where the judge truncates (F26). It protects the page, not the policy. */
export const LISTING_TEXT_HARD_CAP = 20_000;
