// Judge panel from the judge-fit report: end to end at the thresholds in force, per gate k/n with intervals, the six demo
// listings and the limits. SIMULATED corpus, one annotator: never presented as a general accuracy.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { ASSUMED_CHIP, SIMULATED_CHIP } from "../chip";
import type { JudgeFit } from "../judgeFitGuard";
import { J } from "../judgeStrings";
import { formatInterval, formatPct } from "../stats";
import type { InjectionCorpus } from "../types";
import { rateText } from "./Bars";
import { EvChip, EvNum, EvScope } from "./EvNum";

function Kn({ k, n, fit }: { readonly k: number; readonly n: number; readonly fit: JudgeFit }): ReactElement {
  const pct = formatPct(k, n);
  return <EvNum chip={fit.chip}>{pct === null ? `${k}/${n}` : `${k}/${n} · ${pct} · CI ${formatInterval(k, n) ?? ""}`}</EvNum>;
}

function Gates({ fit }: { readonly fit: JudgeFit }): ReactElement {
  return (
    <div className="ev-panel__scroll">
      <table data-gates>
        <thead>
          <tr>
            <th scope="col"><Bi text={J.gate} /></th>
            <th scope="col"><Bi text={J.recall} /></th>
            <th scope="col"><Bi text={J.falseBlock} /></th>
          </tr>
        </thead>
        <tbody>
          {fit.gates.map((g) => (
            <tr key={g.id} data-gate={g.id}>
              <th scope="row">
                <code data-ident>{g.id}</code>{" "}
                {g.threshold !== null ? <><code data-ident>{g.thresholdName}</code> <EvNum chip={ASSUMED_CHIP}>{g.threshold.toFixed(2)}</EvNum></> : null}
              </th>
              <td data-col={J.recall.en}><Kn k={g.recall.k} n={g.recall.n} fit={fit} /></td>
              <td data-col={J.falseBlock.en}><Kn k={g.falseBlock.k} n={g.falseBlock.n} fit={fit} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const word = (v: string | undefined): ReactElement => (v === undefined ? <span className="soft">-</span> : v === "pass" ? <Bi text={J.verdictPass} /> : <strong data-ident>{v}</strong>);

function Listings({ fit }: { readonly fit: JudgeFit }): ReactElement {
  const questions = ["scope", "injection", "seller", "escalate"];
  return (
    <div className="ev-panel__scroll">
      <table data-listings>
        <thead>
          <tr>
            <th scope="col"><Bi text={J.listing} /></th>
            <th scope="col"><Bi text={J.live} /></th>
            <th scope="col"><Bi text={J.recorded} /></th>
          </tr>
        </thead>
        <tbody>
          {fit.listings.map((l) => (
            <tr key={l.name} data-listing={l.name}>
              <th scope="row"><code data-ident>{l.name}</code> <span className="soft" data-ident>{l.note}</span></th>
              {[l.live, l.recorded].map((v, i) => (
                <td key={i} data-col={i === 0 ? J.live.en : J.recorded.en}>{questions.map((q) => <span key={q} className="ev-cell"><code data-ident>{q}</code> {word(v[q])}</span>)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Limits({ fit }: { readonly fit: JudgeFit }): ReactElement {
  return (
    <section className="ev-limits-box" aria-labelledby="ev-limits-title">
      <h4 id="ev-limits-title"><Bi text={J.limitsTitle} /></h4>
      <ul className="ev-limits">
        {[J.limitCorpus, J.limitAnnotator, J.limitSplit, J.limitChinese, J.limitTruncation].map((t) => <li key={t.en}><Bi text={t} /></li>)}
      </ul>
      {fit.limits.length > 0 ? (
        <>
          <h4><Bi text={J.limitFile} /></h4>
          <ul className="ev-limits">{fit.limits.map((t) => <li key={t} data-ident>{t}</li>)}</ul>
        </>
      ) : null}
    </section>
  );
}

export function JudgePanel({ fit, corpus }: { readonly fit: JudgeFit | null; readonly corpus: InjectionCorpus | null }): ReactElement {
  if (fit === null) return <section className="ev-panel"><h3><Bi text={J.title} /></h3><Bi as="p" text={J.noFit} /></section>;
  return (
    <section className="ev-panel" aria-labelledby="ev-judge-title" data-judge-panel>
      <h3 id="ev-judge-title"><Bi text={J.title} /> <EvChip chip={SIMULATED_CHIP} /></h3>
      <p className="soft"><code data-ident>{fit.file}</code></p>
      <Bi as="p" text={J.notAccuracy} className="ev-acc__short" />
      <EvScope chips={[fit.chip]}>
        <h4><Bi text={J.endToEnd} /></h4>
        <dl className="ev-facts">
          <div><dt><Bi text={J.legitApproved} /></dt><dd><Kn k={fit.legitApproved.k} n={fit.legitApproved.n} fit={fit} /></dd></div>
          <div><dt><Bi text={J.injectedApproved} /></dt><dd><Kn k={fit.injectedApproved.k} n={fit.injectedApproved.n} fit={fit} /></dd></div>
        </dl>
        <p className="ev-chart__metric">
          <Bi text={J.thresholds} />{" "}
          {Object.entries(fit.thresholds).map(([k, v]) => <span key={k} className="ev-cell"><code data-ident>{k}</code> <EvNum chip={ASSUMED_CHIP}>{v.toFixed(2)}</EvNum></span>)}
          <span data-ident>[F36, F50]</span>
        </p>
        <h4><Bi text={J.gatesTitle} /></h4>
        <Gates fit={fit} />
      </EvScope>
      {corpus?.heldout ? (
        <p className="ev-chart__metric">
          <Bi text={J.heldout} /> <EvNum chip={corpus.heldout.chip}>{rateText(corpus.heldout)}</EvNum>
          {corpus.tuning ? <><Bi text={J.tuning} /> <EvNum chip={corpus.tuning.chip}>{rateText(corpus.tuning)}</EvNum></> : null}
        </p>
      ) : null}
      <h4><Bi text={J.listingsTitle} /></h4>
      <Listings fit={fit} />
      <Limits fit={fit} />
    </section>
  );
}
