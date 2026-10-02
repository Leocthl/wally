// RunTrace: the four lanes of the pipeline (planner, judge, engine, rail) with live status (docs/04 Run screen).
// Latency chips follow the client: SIMULATED when the mock replays fixture numbers, MEASURED(n=1) when a live call was timed.
import type { ReactElement } from "react";
import type { ApiInfo, Stage } from "../api/types";
import type { Prov } from "../domain/provenance";
import { S } from "../i18n/strings";
import type { RunView, StageView } from "../state/booth";
import { Bi } from "./Bi";
import { IconPending, IconStopped, IconTick } from "./icons";
import { Num } from "./Num";

const LANES: readonly { readonly stage: Stage; readonly title: typeof S.laneplanner }[] = [
  { stage: "planner", title: S.laneplanner },
  { stage: "judge", title: S.lanejudge },
  { stage: "engine", title: S.laneengine },
  { stage: "rail", title: S.lanerail },
];

function StatusIcon({ view }: { readonly view: StageView | undefined }): ReactElement {
  if (!view) return <IconPending />;
  if (view.status === "error") return <IconStopped />;
  return view.status === "done" ? <IconTick /> : <IconPending />;
}

function statusText(view: StageView | undefined): string {
  return view ? (view.status === "running" ? "running" : view.status) : "waiting";
}

function note(stage: Stage, run: RunView, info: ApiInfo | null): string {
  const stageNote = run.stages[stage]?.status === "skipped" ? run.stages[stage]?.note : undefined;
  if (stageNote) return stageNote;
  if (stage === "planner") return `${run.planner?.provider ?? info?.planner.provider ?? "planner"}${run.plannerNote ? `: ${run.plannerNote}` : ""}`;
  if (stage === "judge") return run.judge ? `${run.judge.provider} · ${run.judge.model}` : "";
  if (stage === "engine") return run.decisions.at(-1)?.explanation?.template_id ?? (run.decisions.at(-1) ? "all rules pass" : "");
  return run.mintedCard ? "SIMULATED rail" : (run.stages.rail?.note ?? "");
}

export function RunTrace({ run, info, latencyProv }: { readonly run: RunView | undefined; readonly info: ApiInfo | null; readonly latencyProv: Prov }): ReactElement {
  if (!run) return <Bi as="p" text={S.runIdle} className="soft" />;
  return (
    <ol className="trace" data-register="ledger" aria-label="Live trace">
      {LANES.map(({ stage, title }) => {
        const view = run.stages[stage];
        return (
          <li key={stage} className={`trace__lane trace__lane--${view?.status ?? "waiting"}`} data-stage={stage} data-status={view?.status ?? "waiting"}>
            <span className="trace__icon"><StatusIcon view={view} /></span>
            <span className="trace__title"><Bi text={title} /></span>
            <span className="trace__status">{statusText(view)}</span>
            {view?.latencyMs === undefined ? null : <Num kind="ms" value={view.latencyMs} prov={latencyProv} />}
            <span className="trace__note soft mono" data-ident>{note(stage, run, info)}</span>
          </li>
        );
      })}
    </ol>
  );
}
