// #/evidence, "Why trust Wally?": the harness B0/B1/B2 results with k/n, intervals and chips, the acceptance targets,
// the judge on its own, the manual route (E3) and observed captures (E5). Data is bundled at build time (no network).
// Reading order: wiring banner (when the file says it is not product evidence), the bottom line in words, the run
// picker, the big numbers, targets, charts, every metric, per category; then the judge; then the human files.
import { useState, type ReactElement } from "react";
import { evidenceFile, loadHarnessRuns, loadJudgeFits, type Loaded } from "../evidence/data";
import { CategoryPanel } from "../evidence/components/CategoryPanel";
import { HarnessSection } from "../evidence/components/HarnessSection";
import { Headline } from "../evidence/components/Headline";
import { CapturesPanel, ManualRoutePanel } from "../evidence/components/HumanPanels";
import { JudgePanel } from "../evidence/components/JudgePanel";
import { RunPicker, UnreadablePanel, WiringBanner } from "../evidence/components/RunStatus";
import { Tx } from "../evidence/components/Tx";
import { parseCaptures, parseManualRoute, type Captures, type ManualRoute } from "../evidence/humanGuard";
import type { JudgeFit } from "../evidence/judgeFitGuard";
import { pickRun, sortRuns, wiringStatus } from "../evidence/select";
import { E } from "../evidence/strings";
import type { HarnessRun, Parsed } from "../evidence/types";
import { UI } from "../i18n/ui";
import { useLocale } from "../ui/locale";
import { TopBar } from "../ui/Nav";
import "../evidence/evidence.css";

const EU = UI.evidenceUi;
const parseOrNull = <T,>(raw: unknown, parse: (x: unknown) => Parsed<T>): Parsed<T> | null => (raw === undefined ? null : parse(raw));

/** The wiring banner goes above everything about the run, the picker included. */
function Chosen({ run, picker }: { readonly run: HarnessRun; readonly picker: ReactElement }): ReactElement {
  const status = wiringStatus(run);
  return (
    <>
      <WiringBanner status={status} run={run} />
      <Headline run={run} />
      {picker}
      <HarnessSection run={run} wiring={status.wiringOnly} />
      <CategoryPanel run={run} />
    </>
  );
}

export const BUNDLED = {
  harness: loadHarnessRuns(),
  judge: loadJudgeFits(),
  manual: parseOrNull(evidenceFile("manual-route.json"), parseManualRoute),
  captures: parseOrNull(evidenceFile("captures.json"), parseCaptures),
} as const;

export interface EvidenceScreenProps {
  /** Injected in tests; the booth uses the files bundled from data/results and data/evidence. */
  readonly harness?: Loaded<HarnessRun>;
  readonly judge?: Loaded<JudgeFit>;
  readonly manual?: Parsed<ManualRoute> | null;
  readonly captures?: Parsed<Captures> | null;
}

export function EvidenceScreen({ harness = BUNDLED.harness, judge = BUNDLED.judge, manual = BUNDLED.manual, captures = BUNDLED.captures }: EvidenceScreenProps): ReactElement {
  const { t, locale } = useLocale();
  const runs = sortRuns(harness.items);
  const pick = pickRun(runs);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = runs.find((r) => r.file === chosen) ?? runs.find((r) => r.file === pick?.file) ?? null;
  return (
    <div className="ev" lang={locale} data-screen="evidence">
      <TopBar large title={t(EU.title)} />
      <Tx as="p" text={EU.lead} className="ev-lead" />
      <UnreadablePanel files={[...harness.unreadable, ...judge.unreadable]} />
      {selected === null || pick === null ? (
        <Tx as="p" text={E.unreadableNone} className="ev-unreadable" />
      ) : (
        <Chosen run={selected} picker={<RunPicker runs={runs} selected={selected} reason={chosen === null ? pick.reason : "visitor"} onSelect={setChosen} />} />
      )}
      <h2 className="ev-part"><Tx text={EU.judgeSection} /></h2>
      <JudgePanel fit={judge.items[0] ?? null} corpus={selected?.injectionCorpus ?? null} />
      <h2 className="ev-part"><Tx text={EU.humanSection} /></h2>
      <ManualRoutePanel parsed={manual} />
      <CapturesPanel parsed={captures} />
    </div>
  );
}
