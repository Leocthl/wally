// What the SIMULATED rail answered at checkout: the DM2 beats (overshoot decline, exact charge, replay declined) and the
// failure injections. Declines are alerts; an authorised charge is a status. Every amount wears a chip.
import type { ReactElement } from "react";
import type { CardBeat, CardEvent } from "../api/types";
import type { Prov } from "../domain/provenance";
import { ChipScope } from "./ChipScope";
import { Num } from "./Num";
import { StateBadge, type Tone } from "./StateBadge";
import { SIMULATED } from "../domain/provenance";

const DECLINE_TEXT: Record<NonNullable<CardEvent["decline_code"]>, { readonly en: string; readonly zh: string }> = {
  OVER_LIMIT: { en: "The shop asked for more than the card limit. The limit held.", zh: "商戶要求的金額超出卡額，額度不變。" },
  CARD_USED: { en: "The card was already used once. A replay is declined.", zh: "這張卡已使用過一次，重複使用會被拒絕。" },
  CARD_VOIDED: { en: "The card was voided.", zh: "這張卡已作廢。" },
  CARD_EXPIRED: { en: "The card expired.", zh: "這張卡已過期。" },
  UNKNOWN_HANDLE: { en: "The rail does not know this card handle.", zh: "發卡層不認得這個卡代碼。" },
  MERCHANT_MISMATCH: { en: "Wrong merchant. The merchant lock declined it (SIMULATED lock).", zh: "商戶不符，被商戶鎖拒絕（模擬鎖）。" },
};

function tone(event: CardEvent): Tone {
  if (event.event === "AUTHORISED") return "minted";
  return event.event === "DECLINED" || event.event === "VOIDED" ? "stopped" : "pending";
}

function headline(event: CardEvent, beat: CardBeat): { readonly en: string; readonly zh: string } {
  if (event.event === "DECLINED") return DECLINE_TEXT[event.decline_code ?? "UNKNOWN_HANDLE"];
  if (event.event === "AUTHORISED") {
    return beat === "retry"
      ? { en: "The reply timed out. The retry used the same key, so the rail charged once.", zh: "回覆逾時；重試使用同一個鍵，發卡層只扣款一次。" }
      : { en: "Exact charge authorised on the one-off card.", zh: "已按確實金額授權扣款。" };
  }
  return event.event === "VOIDED" ? { en: "Card voided. The packet gets the limit back.", zh: "卡已作廢，額度退回利是。" } : { en: "Card expired.", zh: "卡已過期。" };
}

/** Rail amounts are always SIMULATED, whichever client is connected (docs/00 D7). */
export function RailBeats({ events }: { readonly events: readonly { readonly event: CardEvent; readonly beat: CardBeat }[] }): ReactElement | null {
  const prov: Prov = SIMULATED;
  if (events.length === 0) return null;
  return (
    <ol className="beats" data-register="ledger" aria-label="Rail answers">
      {events.map(({ event, beat }, i) => {
        const text = headline(event, beat);
        const alert = event.event === "DECLINED" || event.event === "VOIDED";
        return (
          <li key={i} className={`beat beat--${tone(event)}`} role={alert ? "alert" : "status"} data-beat={beat} data-event={event.event} {...(event.decline_code ? { "data-decline": event.decline_code } : {})}>
            <ChipScope provs={[prov]} place="end">
              <p className="beat__state">
                <StateBadge tone={tone(event)} text={event.event} {...(event.decline_code ? { ruleId: event.decline_code } : {})} />
              </p>
              <p lang="en">{text.en}{event.amount_minor === undefined ? null : <> Amount <Num kind="money" value={event.amount_minor} prov={prov} chip="scope" />.</>}</p>
              <p lang="zh-HK">{text.zh}</p>
            </ChipScope>
          </li>
        );
      })}
    </ol>
  );
}
