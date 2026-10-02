// The card story (docs/06 DM2 beats): what the SIMULATED rail answered each time someone presented the one-off card.
// The rail event is the truth (declined with which code, authorised, voided); the trace beat only adds what the event
// cannot say on its own (an authorised charge after a timeout retry). Pure.
import type { CardBeat, CardEvent, CardRecord, Decision, LogEntry } from "../../../api/types";
import type { BoothState } from "../../../state/booth";

export type StoryKind = "overshoot" | "exact" | "retry" | "replay" | "wrong_shop" | "declined" | "drift" | "void" | "expire";

export interface StoryItem {
  readonly key: string;
  readonly kind: StoryKind;
  /** The charge asked for or made, in minor units, when the rail recorded one. */
  readonly amountMinor?: number;
  /** A charge that went through (good) or an attempt that was refused (the card did its job). */
  readonly tone: "ok" | "held" | "neutral";
}

const DECLINE_KIND: Readonly<Record<string, StoryKind>> = {
  OVER_LIMIT: "overshoot",
  CARD_USED: "replay",
  MERCHANT_MISMATCH: "wrong_shop",
};

export function storyKind(event: CardEvent, beat: CardBeat | null, drifted: boolean): StoryKind {
  switch (event.event) {
    case "DECLINED":
      return DECLINE_KIND[event.decline_code ?? ""] ?? "declined";
    case "AUTHORISED":
      return beat === "retry" ? "retry" : "exact";
    case "VOIDED":
      return drifted ? "drift" : "void";
    case "EXPIRED":
      return "expire";
  }
}

function toneOf(kind: StoryKind): StoryItem["tone"] {
  if (kind === "exact" || kind === "retry") return "ok";
  return kind === "void" || kind === "expire" ? "neutral" : "held";
}

function cardEventIn(entry: LogEntry): CardEvent | undefined {
  return entry.kind === "CARD_EVENT" ? (entry.payload as CardEvent) : undefined;
}

/** Card events with beats from this visit's runs; from the signed log when the runs never saw them (a reload). */
function eventsFor(state: BoothState, cardId: string): readonly { readonly event: CardEvent; readonly beat: CardBeat | null }[] {
  const live = state.runs.flatMap((r) => r.cardEvents.filter((e) => e.event.card_id === cardId));
  if (live.length > 0) return live;
  return state.log.entries.flatMap((entry) => {
    const event = cardEventIn(entry);
    return event && event.card_id === cardId ? [{ event, beat: null }] : [];
  });
}

export function cardStory(state: BoothState, card: CardRecord | undefined, chain: readonly Decision[]): readonly StoryItem[] {
  if (!card) return [];
  const drifted = chain.some((d) => d.explanation?.template_id === "R12.price_drift");
  return eventsFor(state, card.id).map(({ event, beat }, i) => {
    const kind = storyKind(event, beat, drifted);
    return { key: `${event.at}-${i}`, kind, tone: toneOf(kind), ...(event.amount_minor === undefined ? {} : { amountMinor: event.amount_minor }) };
  });
}

/** True once the card has been charged (the exact amount or after a retry). */
export function isPaid(story: readonly StoryItem[]): boolean {
  return story.some((s) => s.tone === "ok");
}
