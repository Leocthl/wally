// Read-only mandate summary for the big screen (DM1 after Seal): the sentence, and the rules the engine enforces.
import type { ReactElement } from "react";
import type { Mandate } from "../api/types";
import type { Prov } from "../domain/provenance";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { ChipScope } from "./ChipScope";
import { ChopSeal } from "./icons";
import { Num } from "./Num";

export function MandateSummary({ mandate, prov }: { readonly mandate: Mandate; readonly prov: Prov }): ReactElement {
  const r = mandate.rules;
  return (
    <section className="card mandate-summary" data-register="packet" aria-label="Sealed mandate">
      <ChipScope provs={[prov]}>
        <header className="mandate-summary__head">
          <h2><Bi text={S.sealed} /></h2>
          <ChopSeal className="chop--stamped" />
        </header>
        <blockquote data-ident className="mandate-summary__sentence">{mandate.intent_text}</blockquote>
        <ul className="mandate-summary__rules">
          <li><span data-ident>R3</span> <Bi text={S.packetSize} /> <Num kind="money" value={r.budget.amount_minor} prov={prov} chip="scope" /></li>
          <li><span data-ident>R2</span> <Num kind="time" value={mandate.valid_until} prov={prov} chip="scope" /></li>
          <li><span data-ident>R6</span> <span data-ident>{r.categories.join(", ")}</span></li>
          <li><span data-ident>R9</span> {r.seller_check.require_capture ? "verified sellers only" : "any seller"}</li>
          {r.per_purchase?.ask_above_minor === undefined ? null : <li><span data-ident>R4</span> ask above <Num kind="money" value={r.per_purchase.ask_above_minor} prov={prov} chip="scope" /></li>}
        </ul>
      </ChipScope>
    </section>
  );
}
