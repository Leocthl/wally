// PacketMeter (docs/04, PACKET): the remaining bar inside an envelope outline. It drops on mint and comes back on VOIDED
// or EXPIRED, because it is drawn from the folded packet, never from a counter of its own.
import type { ReactElement } from "react";
import { formatHkd } from "../domain/money";
import { chipText, type Prov } from "../domain/provenance";
import { S } from "../i18n/strings";
import type { PacketState } from "../api/types";
import { Bi } from "./Bi";
import { ChipScope } from "./ChipScope";
import { EnvelopeOutline } from "./icons";
import { Num } from "./Num";
import { StateBadge } from "./StateBadge";

const FULL = 100;
const pct = (part: number, whole: number): number => (whole <= 0 ? 0 : Math.max(0, Math.min(FULL, (part / whole) * FULL)));

export interface PacketMeterProps {
  readonly packet: PacketState;
  readonly prov: Prov;
  /** "l" is the presenter size: numerals at --fs-6 and up (docs/04 Screens). */
  readonly size?: "m" | "l";
}

export function PacketMeter({ packet, prov, size = "m" }: PacketMeterProps): ReactElement {
  const { budget_minor: budget, remaining_minor: left, committed_minor: held, spent_minor: spent } = packet;
  const text = `${formatHkd(left)} left of ${formatHkd(budget)}, ${chipText(prov)}`;
  return (
    <ChipScope provs={[prov]} place="start" className="packet-meter-scope">
      <figure className={`packet-meter packet-meter--${size}`} data-register="packet" data-status={packet.status}>
        <figcaption className="packet-meter__caption">
          <Bi text={S.packetLeft} />
          {packet.status !== "ACTIVE" ? <PacketStatus status={packet.status} /> : null}
        </figcaption>
        <div className="packet-meter__big">
          <Num kind="money" value={left} prov={prov} chip="scope" />
        </div>
        <div className="packet-meter__envelope" role="meter" aria-label="Packet left" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={left} aria-valuetext={text}>
          <EnvelopeOutline className="packet-meter__outline" />
          <div className="packet-meter__track">
            <div className="packet-meter__spent" style={{ width: `${pct(spent, budget)}%` }} />
            <div className="packet-meter__held" style={{ width: `${pct(held, budget)}%` }} />
            <div className="packet-meter__bar" style={{ width: `${pct(left, budget)}%` }} />
          </div>
        </div>
        <dl className="packet-meter__facts">
          <div><dt><Bi text={S.packetSize} /></dt><dd><Num kind="money" value={budget} prov={prov} chip="scope" /></dd></div>
          <div><dt><Bi text={S.heldOnCards} /></dt><dd><Num kind="money" value={held} prov={prov} chip="scope" /></dd></div>
          <div><dt><Bi text={S.spent} /></dt><dd><Num kind="money" value={spent} prov={prov} chip="scope" /></dd></div>
        </dl>
      </figure>
    </ChipScope>
  );
}

function PacketStatus({ status }: { readonly status: PacketState["status"] }): ReactElement {
  const tone = status === "EXHAUSTED" ? "pending" : "stopped";
  return <StateBadge tone={tone} text={status} />;
}
