// "Why trust Wally?" in plain words, the default view: a headline sentence that says what each layer does, a key to the
// three layers, then one card per idea (went over the limit, stopped before paying, trick listings, approved, speed, where
// Wally still gets it wrong), then "How we know", which opens the full developer view in place. Everything is read from
// the loaded run; nothing is typed in here. The numbers are the developer view's numbers, so the two cannot disagree.
import { useId, useState, type ReactElement, type ReactNode } from "react";
import { UI } from "../../../i18n/ui";
import { useLocale } from "../../../ui/locale";
import { TopBar } from "../../../ui/Nav";
import type { FileChip } from "../../chip";
import { practiceSentence } from "../../explainCards";
import { headlineOf, layersLine, shareOf } from "../../explainPlain";
import { readPlain, type PlainModel } from "../../plainModel";
import { P } from "../../plainStrings";
import type { HarnessRun } from "../../types";
import { Tx } from "../Tx";
import { HonestCard, LimitCard, RiskyCard, SpeedCard, TricksCard, WrongCard } from "./PlainCards";
import { FilledSentence, PlainFold, PlainScope, WiringStamp } from "./PlainBits";

const EU = UI.evidenceUi;

export function Hero({ model }: { readonly model: PlainModel }): ReactElement | null {
  const id = useId();
  const { risky, honest, total } = model;
  const headline = headlineOf(risky === null ? null : shareOf(risky.wally), honest === null ? null : shareOf(honest.wally));
  const layers = layersLine({ rulesHoldLimit: model.rulesHoldLimit, listingCheckAdds: model.listingCheckAdds });
  const chips = [risky?.wally.chip, honest?.wally.chip].filter((c): c is FileChip => c !== undefined);
  const chip = chips[0];
  if (headline === null || chip === undefined) return null;
  const split = risky !== null && honest !== null && total === risky.wally.n + honest.wally.n;
  const sub = split
    ? { text: P.heroSplit, slots: { n: total, risky: risky.wally.n, honest: honest.wally.n } }
    : total !== null
      ? { text: P.heroTotal, slots: { n: total } }
      : null;
  return (
    <PlainScope as="section" labelledBy={id} card="hero" chips={chips} className="evp-hero">
      <WiringStamp on={model.wiringOnly} />
      <h2 id={id} className="evp-hero__title"><Tx text={headline} /></h2>
      {layers === null ? null : <Tx as="p" text={layers} className="evp-hero__layers" />}
      {sub === null ? null : <FilledSentence as="p" className="evp-hero__sub" s={sub} chip={chip} />}
    </PlainScope>
  );
}

/** A short key to the three layers the bars show, only the ones this run has. */
function Legend({ model, folded = false }: { readonly model: PlainModel; readonly folded?: boolean }): ReactElement {
  const id = useId();
  const all = [model.limit, model.risky, model.tricks, model.honest];
  const rules = all.some((v) => v?.rules != null);
  const alone = all.some((v) => v?.alone != null);
  const rows = [
    ...(rules ? [{ who: "rules", name: P.rules, desc: P.rulesDesc }] : []),
    { who: "wally", name: P.wally, desc: P.wallyDesc },
    ...(alone ? [{ who: "alone", name: P.alone, desc: P.aloneDesc }] : []),
  ];
  return (
    <section className="evp-legend" aria-labelledby={id} data-plain-card="layers">
      <h3 id={id} className={folded ? "sr-only" : "evp-card__title"}><Tx text={P.layersTitle} /></h3>
      <dl className="evp-legend__list">
        {rows.map((r) => (
          <div key={r.who} className="evp-legend__row">
            <dt><span className="evp-swatch" data-who={r.who} aria-hidden="true" /><Tx text={r.name} /></dt>
            <dd><Tx text={r.desc} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function WiringNote(): ReactElement {
  const id = useId();
  return (
    <section className="ev-wiring" aria-labelledby={id} data-wiring-banner>
      <h3 id={id} className="ev-wiring__title"><Tx text={P.wiringTitle} /></h3>
      <Tx as="p" text={P.wiringBody} />
    </section>
  );
}

/** Is there anything in the run to put on a card? */
export function hasFigures(model: PlainModel): boolean {
  return model.limit !== null || model.risky !== null || model.tricks !== null || model.honest !== null || model.judgeMiss !== null || model.speed.kind !== "absent";
}

/**
 * The page opens on the headline and then a short list: what each layer adds, and the five things the numbers are about, each
 * behind its title. Where Wally still gets it wrong stays open: the limits are not something to tap for.
 */
function Figures({ model }: { readonly model: PlainModel }): ReactElement {
  const wiring = model.wiringOnly;
  return (
    <>
      {wiring ? <WiringNote /> : null}
      <Hero model={model} />
      <div className="evp-folds">
        <PlainFold id="layers" title={P.layersTitle}><Legend model={model} folded /></PlainFold>
        {model.limit === null ? null : <PlainFold id="limit" title={P.limitTitle}><LimitCard v={model.limit} wiring={wiring} folded /></PlainFold>}
        {model.risky === null ? null : <PlainFold id="risky" title={P.riskyTitle}><RiskyCard v={model.risky} kinds={model.riskyKinds} wiring={wiring} folded /></PlainFold>}
        {model.tricks === null ? null : <PlainFold id="tricks" title={P.tricksTitle}><TricksCard v={model.tricks} wiring={wiring} folded /></PlainFold>}
        {model.honest === null ? null : <PlainFold id="honest" title={P.honestTitle}><HonestCard v={model.honest} wiring={wiring} folded /></PlainFold>}
        {model.speed.kind === "absent" ? null : <PlainFold id="speed" title={P.speedTitle}><SpeedCard speed={model.speed} wiring={wiring} folded /></PlainFold>}
      </div>
      <WrongCard model={model} wiring={wiring} />
      <Tx as="p" text={practiceSentence().text} className="evp-foot" />
    </>
  );
}

/** The developer view of the same data, mounted only once it is opened (it is long). */
function HowWeKnow({ renderDetails }: { readonly renderDetails: () => ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <details className="disclosure evp-know" data-panel="how-we-know" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><Tx text={P.howTitle} /></summary>
      {open ? (
        <div className="evp-know__body">
          <Tx as="p" text={P.howIntro} className="soft ev-note" />
          {renderDetails()}
        </div>
      ) : null}
    </details>
  );
}

export interface PlainEvidenceProps {
  /** The run on screen (the one the developer view's picker has chosen), or null when no file could be read. */
  readonly run: HarnessRun | null;
  /** A result file could not be read: said in one line here, in full under How we know. */
  readonly unreadable: boolean;
  readonly renderDetails: () => ReactNode;
}

export function PlainEvidence({ run, unreadable, renderDetails }: PlainEvidenceProps): ReactElement {
  const { t, locale } = useLocale();
  const model = run === null ? null : readPlain(run);
  return (
    <div className="ev evp" lang={locale} data-screen="evidence" data-mode="plain">
      <TopBar large title={t(EU.title)} />
      <Tx as="p" text={P.lead} className="ev-lead" />
      {model === null || !hasFigures(model) ? <Tx as="p" text={P.noResults} className="ev-unreadable" /> : <Figures model={model} />}
      {unreadable ? <Tx as="p" text={P.someUnreadable} className="ev-unreadable" /> : null}
      <HowWeKnow renderDetails={renderDetails} />
    </div>
  );
}
