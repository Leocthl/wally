// Judge panel, in reading order: a one-line verdict computed from the file, before/after on the same held-out cases,
// per gate with the seller note, the six demo listings, every wording variant, and the limits. SIMULATED corpus and one
// annotator: never presented as a general accuracy. Reads judge-fit v1 and v2 (judgeFit.ts).
import type { ReactElement } from "react";
import { ASSUMED_CHIP, SIMULATED_CHIP } from "../chip";
import type { JudgeFit } from "../judgeFit";
import { J } from "../judgeStrings";
import { F38 } from "../select";
import type { InjectionCorpus } from "../types";
import { rateText } from "./Bars";
import { EvChip, EvNum, EvScope } from "./EvNum";
import { JudgeLimits } from "./JudgeLimits";
import { BeforeAfter, countText, Gates, Listings, Variants } from "./JudgeTables";
import { Sentence, Tx } from "./Tx";

function Verdict({ fit }: { readonly fit: JudgeFit }): ReactElement {
  const { legit, injected } = fit.evaluated.approvals;
  const met = legit.n > 0 && legit.k * 100 >= legit.n * F38.minApprovedPct;
  const fitted = fit.schema === "judge-fit/v2";
  const [a, b] = fitted ? [J.verdictFittedA, J.verdictFittedB] : [J.verdictInForceA, J.verdictInForceB];
  const n1 = <EvNum chip={fit.chip}>{countText(legit)}</EvNum>;
  const n2 = <EvNum chip={fit.chip}>{countText(injected)}</EvNum>;
  const target = <EvNum chip={ASSUMED_CHIP}>{F38.minApprovedPct}%</EvNum>;
  const end = met ? J.met : J.notMet;
  return (
    <div className="ev-judge-verdict" data-judge-verdict data-met={met}>
      <Sentence en={<>{a.en} {n1} {b.en} {n2} {J.verdictC.en} {target} {J.verdictD.en} <strong>{end.en}</strong></>} zh={<>{a.zh} {n1}{b.zh} {n2}{J.verdictC.zh} {target} {J.verdictD.zh}<strong>{end.zh}</strong></>} />
      {fitted ? null : <Tx as="p" text={J.sameCases} className="soft" />}
      {fit.fileSaysF38Met !== null && fit.fileSaysF38Met !== met ? <Tx as="p" text={J.verdictDisagrees} className="ev-acc__short" /> : null}
    </div>
  );
}

function SellerNote({ fit }: { readonly fit: JudgeFit }): ReactElement | null {
  const gates = fit.evaluated.gates.filter((g) => g.id.startsWith("seller"));
  const gate = gates.find((g) => g.id === "seller_escalate") ?? gates[0];
  const highRisk = fit.evaluated.approvals.highRisk;
  if (gate === undefined || highRisk === null || fit.schema !== "judge-fit/v2") return null;
  const r = <EvNum chip={fit.chip}>{countText(gate.recall)}</EvNum>;
  const h = <EvNum chip={fit.chip}>{countText(highRisk)}</EvNum>;
  return (
    <div className="ev-judge-note" data-seller-note>
      <Sentence en={<>{J.sellerA.en} {r} {J.sellerB.en} {h} {J.sellerC.en}</>} zh={<>{J.sellerA.zh} {r}{J.sellerB.zh} {h}{J.sellerC.zh}</>} />
      {gate.recall.k === 0 && gate.recall.n > 0 ? <Tx as="p" text={J.sellerInert} /> : null}
    </div>
  );
}

export function JudgePanel({ fit, corpus }: { readonly fit: JudgeFit | null; readonly corpus: InjectionCorpus | null }): ReactElement {
  if (fit === null) return <section className="ev-panel"><h3 className="ev-panel__title"><Tx text={J.title} /></h3><Tx as="p" text={J.noFit} /></section>;
  const variants = fit.variants.length > 0 && fit.tuningChip !== null;
  return (
    <section className="ev-panel ev-judge" aria-labelledby="ev-judge-title" data-judge-panel data-schema={fit.schema}>
      <div className="ev-panel__head">
        <h3 id="ev-judge-title" className="ev-panel__title"><Tx text={J.title} /></h3>
        <EvChip chip={SIMULATED_CHIP} />
      </div>
      <EvScope chips={[fit.chip]} className="ev-judge__scope">
        <Verdict fit={fit} />
        <Tx as="p" text={J.notAccuracy} className="ev-acc__short" />
        <BeforeAfter fit={fit} />
        <h4 className="ev-subtitle"><Tx text={J.gatesTitle} /></h4>
        <Gates fit={fit} />
        <SellerNote fit={fit} />
      </EvScope>
      {corpus?.heldout ? (
        <p className="ev-chart__metric">
          <code data-ident>injection_corpus</code> <EvNum chip={corpus.heldout.chip}>{rateText(corpus.heldout)}</EvNum>
        </p>
      ) : null}
      <h4 className="ev-subtitle"><Tx text={J.listingsTitle} /></h4>
      <Listings fit={fit} />
      {variants ? (
        <details className="disclosure ev-disclosure" data-panel="variants">
          <summary><Tx text={J.variantsTitle} /></summary>
          <Variants fit={fit} heading={false} />
        </details>
      ) : null}
      <JudgeLimits fit={fit} />
      <p className="ev-file"><code data-ident>{fit.file}</code> <code data-ident>{fit.schema}</code></p>
    </section>
  );
}
