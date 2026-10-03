// Presenter DM8 in plain words: the headline and the four cards that carry the claim (went over the limit, stopped before
// paying, trick listings, approved), two by two on a big screen, with the same sentences, zero limits and chips as the
// phone view. Speed, where Wally still gets it wrong and the developer details stay on the evidence screen, one link away.
import type { ReactElement } from "react";
import { DM8 } from "../../dm9";
import { practiceSentence } from "../../explainCards";
import { readPlain } from "../../plainModel";
import { P } from "../../plainStrings";
import type { HarnessRun } from "../../types";
import { Tx } from "../Tx";
import { HonestCard, LimitCard, RiskyCard, TricksCard } from "./PlainCards";
import { hasFigures, Hero, WiringNote } from "./PlainEvidence";

export function PlainStage({ run }: { readonly run: HarnessRun | null }): ReactElement {
  const model = run === null ? null : readPlain(run);
  const wiring = model?.wiringOnly ?? false;
  return (
    <div className="ev evp evp--stage ev--stage" data-beat="DM8" data-mode="plain">
      {model === null || !hasFigures(model) ? (
        <Tx as="p" text={P.noResults} className="ev-unreadable" />
      ) : (
        <>
          {wiring ? <WiringNote /> : null}
          <Hero model={model} />
          <div className="evp-stage__cards">
            {model.limit === null ? null : <LimitCard v={model.limit} wiring={wiring} />}
            {model.risky === null ? null : <RiskyCard v={model.risky} kinds={model.riskyKinds} wiring={wiring} />}
            {model.tricks === null ? null : <TricksCard v={model.tricks} wiring={wiring} />}
            {model.honest === null ? null : <HonestCard v={model.honest} wiring={wiring} />}
          </div>
          <Tx as="p" text={practiceSentence().text} className="evp-foot" />
        </>
      )}
      <p className="soft ev-note">
        <Tx text={DM8.deeper} /> <a className="tap ev-link" href="#/evidence"><Tx text={DM8.openFull} /></a>
      </p>
    </div>
  );
}
