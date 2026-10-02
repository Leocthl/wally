// T-H1 and T-H2 [F38]: met or missed in words and by an icon, k/n, the target, and how far a miss fell short.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { ASSUMED_CHIP } from "../chip";
import { acceptanceGap, F38 } from "../select";
import { E } from "../strings";
import type { AcceptanceRow } from "../types";
import { rateText } from "./Bars";
import { EvNum } from "./EvNum";
import { MarkMiss, MarkPass } from "./marks";

function Target({ row }: { readonly row: AcceptanceRow }): ReactElement {
  if (row.id === "T-H1") return <p className="ev-acc__target"><Bi text={E.th1Target} /> <span data-ident>[F38]</span></p>;
  if (row.id === "T-H2") {
    return (
      <p className="ev-acc__target">
        <Bi text={E.th2Target} /> <EvNum chip={ASSUMED_CHIP}>{F38.minApprovedPct}%</EvNum> <span data-ident>[F38]</span>
      </p>
    );
  }
  return <p className="ev-acc__target" data-ident>{row.target}</p>;
}

function Shortfall({ row }: { readonly row: AcceptanceRow }): ReactElement | null {
  const gap = acceptanceGap(row);
  if (!gap.known || gap.met) return null;
  if (row.id === "T-H2" && row.result.n === 0) return <Bi as="p" text={E.th2Empty} className="ev-acc__short" />;
  return (
    <p className="ev-acc__short">
      <Bi text={row.id === "T-H1" ? E.th1Short : E.th2Short} /> <EvNum chip={row.result.chip}>{gap.short}</EvNum>
    </p>
  );
}

export function AcceptanceStrip({ rows }: { readonly rows: readonly AcceptanceRow[] | null }): ReactElement | null {
  if (rows === null || rows.length === 0) return null;
  return (
    <section className="ev-acc" aria-labelledby="ev-acc-title">
      <h3 id="ev-acc-title"><Bi text={E.acceptanceTitle} /> <span data-ident>[F38]</span></h3>
      <ul className="ev-acc__list">
        {rows.map((row) => {
          const gap = acceptanceGap(row);
          const met = gap.known ? gap.met && row.pass : row.pass;
          return (
            <li key={row.id} className={`ev-acc__row ev-acc__row--${met ? "met" : "missed"}`} data-acceptance={row.id} data-met={met}>
              <p className="ev-acc__verdict">
                {met ? <MarkPass /> : <MarkMiss />}
                <strong data-ident>{row.id}</strong> <Bi text={met ? E.met : E.missed} />
              </p>
              <Target row={row} />
              <p className="ev-acc__result">
                <span data-ident>{row.evaluatedOn}</span> <EvNum chip={row.result.chip}>{rateText(row.result)}</EvNum>
              </p>
              <Shortfall row={row} />
              {gap.consistent ? null : <Bi as="p" text={E.inconsistent} className="ev-acc__short" />}
            </li>
          );
        })}
      </ul>
      <Bi as="p" text={E.noRetune} className="soft ev-note" />
    </section>
  );
}
