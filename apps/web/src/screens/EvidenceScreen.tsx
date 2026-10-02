// Evidence (docs/04 Screens, LEDGER): harness B0/B1/B2 with k/n and intervals, acceptance, judge fit, manual route (E3)
// and OBSERVED captures (E5). Data is bundled at build time, so this works with no network (DM8 deeper view).
import { useState, type ReactElement } from "react";
import { Bi } from "../components/Bi";
import { loadHarnessRuns, type Loaded } from "../evidence/data";
import { HarnessSection } from "../evidence/components/HarnessSection";
import { RunPicker, UnreadablePanel } from "../evidence/components/RunStatus";
import { pickRun, sortRuns } from "../evidence/select";
import { E } from "../evidence/strings";
import type { HarnessRun } from "../evidence/types";
import "../evidence/evidence.css";

const BUNDLED = loadHarnessRuns();

export interface EvidenceScreenProps {
  /** Injected in tests; the booth uses the files bundled from data/results. */
  readonly harness?: Loaded<HarnessRun>;
}

export function EvidenceScreen({ harness = BUNDLED }: EvidenceScreenProps): ReactElement {
  const runs = sortRuns(harness.items);
  const pick = pickRun(runs);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = runs.find((r) => r.file === chosen) ?? runs.find((r) => r.file === pick?.file) ?? null;
  return (
    <div className="ev" data-register="ledger">
      <h2 className="ev__title"><Bi text={E.title} /></h2>
      <UnreadablePanel files={harness.unreadable} />
      {selected === null || pick === null ? (
        <Bi as="p" text={E.unreadableNone} className="ev-unreadable" />
      ) : (
        <>
          <RunPicker runs={runs} selected={selected} reason={chosen === null ? pick.reason : "visitor"} onSelect={setChosen} />
          <HarnessSection run={selected} />
        </>
      )}
    </div>
  );
}
