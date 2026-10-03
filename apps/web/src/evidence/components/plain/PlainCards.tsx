// The plain cards, one idea each: a title, a big number, the sentences, a bar for each layer and the chip. Every figure
// comes from the loaded run (plainModel.ts) and every sentence from the glossary (explainCards.ts), so the cards cannot
// say more than the file does, and a card whose figures are not in the file is simply not drawn. The bars always read
// rules only, Wally, then an AI on its own for reference: what each layer adds, with rules versus Wally first.
import { useId, type ReactElement, type ReactNode } from "react";
import type { LabelPair } from "../../../i18n/label";
import { cx } from "../../../ui/cx";
import type { FileChip } from "../../chip";
import { falseAlarmBullet, honestSentences, judgeMissSentence, limitSentences, riskySentences, speedSentences, TRICKS_NOTE, tricksSentences, type Layers } from "../../explainCards";
import { riskyKindsSentence, secondsOf, type Sentence } from "../../explainPlain";
import type { Layered, PlainModel, Speed } from "../../plainModel";
import { P } from "../../plainStrings";
import type { Rate } from "../../types";
import { Tx } from "../Tx";
import { fill, PlainBars, type BarRow } from "./PlainBars";
import { FilledSentence, PlainNum, PlainScope, WiringStamp } from "./PlainBits";

interface CardProps {
  readonly id: string;
  readonly title: LabelPair;
  readonly chips: readonly FileChip[];
  readonly wiring: boolean;
  readonly variant?: "wrong";
  readonly children: ReactNode;
}

function Card({ id, title, chips, wiring, variant, children }: CardProps): ReactElement {
  const heading = useId();
  return (
    <PlainScope as="article" labelledBy={heading} card={id} chips={chips} className={cx("evp-card", variant && `evp-card--${variant}`)}>
      <WiringStamp on={wiring} />
      <h3 id={heading} className="evp-card__title"><Tx text={title} /></h3>
      {children}
    </PlainScope>
  );
}

/** The one number the card is about, large, with what it is out of beside it. */
function Big({ value, tail, tailSlots, chip }: { readonly value: number | string; readonly tail: LabelPair; readonly tailSlots: Readonly<Record<string, number | string>>; readonly chip: FileChip }): ReactElement {
  return (
    <p className="evp-big">
      <span className="evp-big__k"><PlainNum chip={chip}>{value}</PlainNum></span>{" "}
      <FilledSentence as="span" className="evp-big__tail" s={{ text: tail, slots: tailSlots }} chip={chip} />
    </p>
  );
}

/** The card's sentences: the first is the point, the rest follow in the same voice. */
function Sentences({ list, chip }: { readonly list: readonly Sentence[]; readonly chip: FileChip }): ReactElement {
  return (
    <>
      {list.map((s, i) => <FilledSentence key={s.text.en} as="p" className={i === 0 ? "evp-card__sentence" : "evp-card__line"} s={s} chip={chip} />)}
    </>
  );
}

const count = (r: Rate): ReactElement => <FilledSentence as="span" s={{ text: P.count, slots: { k: r.k, n: r.n } }} chip={r.chip} />;

/** Rules only, Wally, AI alone: one bar each for the layers the file has, every bar a share of its own whole. */
function layerRows(v: Layered): readonly BarRow[] {
  const row = (id: string, name: LabelPair, tone: BarRow["tone"], r: Rate): BarRow => ({ id, name, share: fill(r.k, r.n), tone, value: count(r) });
  return [
    ...(v.rules === null ? [] : [row("rules", P.rules, "rules", v.rules)]),
    row("wally", P.wally, "wally", v.wally),
    ...(v.alone === null ? [] : [row("alone", P.alone, "alone", v.alone)]),
  ];
}

const chipsOf = (v: Layered): readonly FileChip[] => [v.wally, v.rules, v.alone].flatMap((r) => (r === null ? [] : [r.chip]));
const layers = (v: Layered): Layers => ({ wally: v.wally, rules: v.rules });

export function LimitCard({ v, wiring }: { readonly v: Layered; readonly wiring: boolean }): ReactElement {
  const chip = v.wally.chip;
  return (
    <Card id="limit" title={P.limitTitle} chips={chipsOf(v)} wiring={wiring}>
      <Big value={v.wally.k} tail={P.limitTail} tailSlots={{ n: v.wally.n }} chip={chip} />
      <Sentences list={limitSentences(layers(v))} chip={chip} />
      <PlainBars caption={P.limitCaption} rows={layerRows(v)} />
    </Card>
  );
}

export function RiskyCard({ v, kinds, wiring }: { readonly v: Layered; readonly kinds: readonly string[]; readonly wiring: boolean }): ReactElement {
  const chip = v.wally.chip;
  const included = riskyKindsSentence(kinds);
  return (
    <Card id="risky" title={P.riskyTitle} chips={chipsOf(v)} wiring={wiring}>
      <Big value={v.wally.k} tail={P.riskyTail} tailSlots={{ n: v.wally.n }} chip={chip} />
      <Sentences list={riskySentences(layers(v))} chip={chip} />
      {included === null ? null : <Tx as="p" text={included} className="evp-card__note" />}
      <PlainBars caption={P.riskyCaption} rows={layerRows(v)} />
    </Card>
  );
}

/** What the listing check adds: the trick listings no fixed rule would stop. */
export function TricksCard({ v, wiring }: { readonly v: Layered; readonly wiring: boolean }): ReactElement {
  const chip = v.wally.chip;
  return (
    <Card id="tricks" title={P.tricksTitle} chips={chipsOf(v)} wiring={wiring}>
      <Big value={v.wally.k} tail={P.tricksTail} tailSlots={{ n: v.wally.n }} chip={chip} />
      <Sentences list={tricksSentences(layers(v))} chip={chip} />
      <Tx as="p" text={TRICKS_NOTE} className="evp-card__note" />
      <PlainBars caption={P.tricksCaption} rows={layerRows(v)} />
    </Card>
  );
}

export function HonestCard({ v, wiring }: { readonly v: Layered; readonly wiring: boolean }): ReactElement {
  const chip = v.wally.chip;
  return (
    <Card id="honest" title={P.honestTitle} chips={chipsOf(v)} wiring={wiring}>
      <Big value={v.wally.k} tail={P.honestTail} tailSlots={{ n: v.wally.n }} chip={chip} />
      <Sentences list={honestSentences(layers(v))} chip={chip} />
      <PlainBars caption={P.honestCaption} rows={layerRows(v)} />
    </Card>
  );
}

function speedRows(speed: Extract<Speed, { kind: "measured" }>): readonly BarRow[] {
  const longest = Math.max(speed.typicalMs, speed.rulesTypicalMs ?? 0, speed.aloneTypicalMs ?? 0);
  const row = (id: string, name: LabelPair, tone: BarRow["tone"], ms: number): BarRow => ({
    id, name, tone, share: longest > 0 ? ms / longest : 0, value: <PlainNum chip={speed.chip}>{secondsOf(ms)}</PlainNum>,
  });
  return [
    ...(speed.rulesTypicalMs === null ? [] : [row("rules", P.rules, "rules", speed.rulesTypicalMs)]),
    row("wally", P.wally, "wally", speed.typicalMs),
    ...(speed.aloneTypicalMs === null ? [] : [row("alone", P.alone, "alone", speed.aloneTypicalMs)]),
  ];
}

export function SpeedCard({ speed, wiring }: { readonly speed: Speed; readonly wiring: boolean }): ReactElement | null {
  if (speed.kind === "absent") return null;
  if (speed.kind === "unmeasured") {
    return (
      <Card id="speed" title={P.speedTitle} chips={[speed.chip]} wiring={wiring}>
        <Tx as="p" text={P.speedNone} className="evp-card__sentence" />
      </Card>
    );
  }
  const { chip } = speed;
  return (
    <Card id="speed" title={P.speedTitle} chips={[chip]} wiring={wiring}>
      <Big value={secondsOf(speed.typicalMs)} tail={P.speedTail} tailSlots={{}} chip={chip} />
      <Sentences list={speedSentences(speed)} chip={chip} />
      <PlainBars caption={P.speedCaption} rows={speedRows(speed)} />
      <Tx as="p" text={P.speedScope} className="evp-card__note" />
    </Card>
  );
}

export function WrongCard({ model, wiring }: { readonly model: PlainModel; readonly wiring: boolean }): ReactElement | null {
  const { honest, judgeMiss } = model;
  if (honest === null && judgeMiss === null) return null;
  const chips = [honest?.wally.chip, judgeMiss?.chip].filter((c): c is FileChip => c !== undefined);
  return (
    <Card id="wrong" title={P.wrongTitle} chips={chips} wiring={wiring} variant="wrong">
      <ul className="evp-wrong">
        {honest === null ? null : (
          <li data-wrong="false-alarms">
            <FilledSentence s={falseAlarmBullet({ k: honest.wally.n - honest.wally.k, n: honest.wally.n })} chip={honest.wally.chip} />
          </li>
        )}
        {judgeMiss === null ? null : (
          <li data-wrong="listing-check">
            <FilledSentence s={judgeMissSentence(judgeMiss)} chip={judgeMiss.chip} />
          </li>
        )}
      </ul>
    </Card>
  );
}
