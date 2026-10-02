// Judge panel, in reading order: a one-line verdict computed from the file, before/after on the same held-out cases,
// per gate with the seller note, the six demo listings, every wording variant, and the limits. SIMULATED corpus and one
// annotator: never presented as a general accuracy. Reads judge-fit v1 and v2 (judgeFit.ts).
import type { ReactElement, ReactNode } from "react";
import { Bi } from "../../components/Bi";
import { ASSUMED_CHIP, SIMULATED_CHIP } from "../chip";
import type { JudgeFit } from "../judgeFit";
import { J } from "../judgeStrings";
import { F38 } from "../select";
import type { InjectionCorpus } from "../types";
import { rateText } from "./Bars";
import { EvChip, EvNum, EvScope } from "./EvNum";
import { JudgeLimits } from "./JudgeLimits";
import { BeforeAfter, countText, Gates, Listings, Variants } from "./JudgeTables";

/** A bilingual line with figures inside it; same DOM contract as Bi (EN first, zh-HK second with lang). */
function Sentence({ en, zh, className }: { readonly en: ReactNode; readonly zh: ReactNode; readonly className?: string }): ReactElement {
  return (
    <p className={`bi ev-sentence ${className ?? ""}`.trim()}>
      <span className="bi__en">{en}</span>
      <span className="bi__zh" lang="zh-HK">{zh}</span>
    </p>
  );
}

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
      {fitted ? null : <Bi as="p" text={J.sameCases} className="soft" />}
      {fit.fileSaysF38Met !== null && fit.fileSaysF38Met !== met ? <Bi as="p" text={J.verdictDisagrees} className="ev-acc__short" /> : null}
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
      {gate.recall.k === 0 && gate.recall.n > 0 ? <Bi as="p" text={J.sellerInert} /> : null}
    </div>
  );
}

export function JudgePanel({ fit, corpus }: { readonly fit: JudgeFit | null; readonly corpus: InjectionCorpus | null }): ReactElement {
  if (fit === null) return <section className="ev-panel"><h3><Bi text={J.title} /></h3><Bi as="p" text={J.noFit} /></section>;
  return (
    <section className="ev-panel" aria-labelledby="ev-judge-title" data-judge-panel data-schema={fit.schema}>
      <h3 id="ev-judge-title"><Bi text={J.title} /> <EvChip chip={SIMULATED_CHIP} /></h3>
      <p className="soft"><code data-ident>{fit.file}</code> <code data-ident>{fit.schema}</code></p>
      <EvScope chips={[fit.chip]}>
        <Verdict fit={fit} />
        <Bi as="p" text={J.notAccuracy} className="ev-acc__short" />
        <BeforeAfter fit={fit} />
        <h4><Bi text={J.gatesTitle} /></h4>
        <Gates fit={fit} />
        <SellerNote fit={fit} />
      </EvScope>
      {corpus?.heldout ? (
        <p className="ev-chart__metric">
          <code data-ident>injection_corpus</code> <EvNum chip={corpus.heldout.chip}>{rateText(corpus.heldout)}</EvNum>
        </p>
      ) : null}
      <h4><Bi text={J.listingsTitle} /></h4>
      <Listings fit={fit} />
      <Variants fit={fit} />
      <JudgeLimits fit={fit} />
    </section>
  );
}
