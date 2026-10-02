// The moments under comparison and their variants. Each variant is a real component that takes the props of the screen
// component it would replace, so promoting a winner is a swap, not a rewrite.
import { createRef, type ReactElement } from "react";
import type { PacketState, ScenarioId } from "../../../api/types";
import type { ApprovedProps } from "../components/Approved";
import type { OkVariantProps } from "./ok/types";
import type { Result } from "../model/screen";
import { NeedsOk } from "../components/NeedsOk";
import { NeedsOkHold } from "./ok/Hold";
import { NeedsOkSlip } from "./ok/Slip";
import { ApprovedLive } from "./card/Live";
import { ApprovedTicket } from "./card/Ticket";
import { Approved } from "../components/Approved";
import { Stopped } from "../components/Stopped";
import { StoppedGhost } from "./stopped/Ghost";
import { StoppedSteps } from "./stopped/Steps";

export type MomentId = "stopped" | "card" | "ok";

/** What the harness hands a variant: the real result for the case on show, and no-op handlers that open the Why sheet. */
export interface VariantContext {
  readonly result: Result;
  readonly packet: PacketState | null;
  readonly onWhy: () => void;
}

export interface VariantDef {
  readonly name: string;
  readonly axis: string;
  readonly render: (ctx: VariantContext) => ReactElement | null;
}

export interface CaseDef {
  readonly id: string;
  readonly label: string;
  readonly scenarios: readonly ScenarioId[];
}

export interface MomentDef {
  readonly id: MomentId;
  readonly title: string;
  readonly brief: string;
  readonly cases: readonly CaseDef[];
  readonly variants: readonly VariantDef[];
}

const noop = (): void => undefined;

function approvedProps(c: VariantContext): ApprovedProps {
  return { result: c.result, packet: c.packet, fresh: true, headingRef: heading, paying: false, canPay: c.result.card?.state === "ACTIVE", onPay: noop, onWhy: c.onWhy };
}
const heading = createRef<HTMLHeadingElement>();

export const STOPPED: MomentDef = {
  id: "stopped",
  title: "Stopped before paying",
  brief: "Calm and clear: what happened, why in plain words, that no money moved, and what to do next.",
  cases: [
    { id: "budget", label: "Over budget", scenarios: ["overflow"] },
    { id: "seller", label: "Flagged seller", scenarios: ["flagged"] },
    { id: "injected", label: "Listing gives orders", scenarios: ["injected"] },
    { id: "off", label: "Off category", scenarios: ["off_category"] },
  ],
  variants: [
    { name: "Quiet guard", axis: "SHIPPED. One calm card, the reason first, the path Wally took", render: (c) => <Stopped result={c.result} packet={c.packet} fresh headingRef={heading} onWhy={c.onWhy} onTopUp={noop} onAsk={noop} onCheaper={noop} /> },
    { name: "Ghost card", axis: "The card that was not made, drawn empty", render: (c) => <StoppedGhost result={c.result} packet={c.packet} fresh headingRef={heading} onWhy={c.onWhy} onTopUp={noop} onAsk={noop} onCheaper={noop} /> },
    { name: "Where it stopped", axis: "The shopping steps, settled at the rules check", render: (c) => <StoppedSteps result={c.result} packet={c.packet} fresh headingRef={heading} onWhy={c.onWhy} onTopUp={noop} onAsk={noop} onCheaper={noop} /> },
  ],
};

export const CARD: MomentDef = {
  id: "card",
  title: "The one-off card",
  brief: "The card for the exact total, SIMULATED, with its clock, Pay now, and what happens when it is used, declined or voided.",
  cases: [
    { id: "ready", label: "Ready", scenarios: ["mint"] },
    { id: "declined", label: "Shop asks more", scenarios: ["mint", "overshoot"] },
    { id: "paid", label: "Paid", scenarios: ["mint", "pay"] },
    { id: "replay", label: "Replay", scenarios: ["mint", "pay", "replay"] },
    { id: "drift", label: "Price changed", scenarios: ["mint", "drift"] },
  ],
  variants: [
    { name: "Wallet card", axis: "SHIPPED. The card is the hero; amount big; deal-in and a light sweep", render: (c) => <Approved {...approvedProps(c)} /> },
    { name: "Ticket stub", axis: "A perforated ticket printed from a slot; the stub tears when used", render: (c) => <ApprovedTicket {...approvedProps(c)} /> },
    { name: "Live card", axis: "Time and action first: a draining ring and Pay now inside", render: (c) => <ApprovedLive {...approvedProps(c)} /> },
  ],
};

function okProps(c: VariantContext): OkVariantProps {
  return { result: c.result, headingRef: heading, answering: null, onAnswer: noop, onWhy: c.onWhy };
}

export const OK: MomentDef = {
  id: "ok",
  title: "Needs your OK",
  brief: "A clear sense of consent: what is being asked, what yes will do, how long there is, and that the answer is signed.",
  cases: [{ id: "seller", label: "Seller not checked", scenarios: ["unverified"] }],
  variants: [
    { name: "Consent sheet", axis: "SHIPPED. The question rises as a sheet, answers pinned at the bottom", render: (c) => <NeedsOk {...okProps(c)} /> },
    { name: "Hold to approve", axis: "Yes is a press-and-hold gesture", render: (c) => <NeedsOkHold {...okProps(c)} /> },
    { name: "Permission slip", axis: "A calm slip: what, how much, then what happens", render: (c) => <NeedsOkSlip {...okProps(c)} /> },
  ],
};

export const MOMENTS: readonly MomentDef[] = [STOPPED, CARD, OK];
