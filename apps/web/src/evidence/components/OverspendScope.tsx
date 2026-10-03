// Under the overspend figure: the two zeros on this page count different things. The big number counts every scenario
// the run drew; target T-H1 counts only the deterministic ones. Both counts are read from the loaded result (no number
// is written here), each wearing the chip of the count it came from. Left out when the counts cover the same scenarios.
import type { ReactElement } from "react";
import { UI } from "../../i18n/ui";
import type { HarnessRun } from "../types";
import { EvNum } from "./EvNum";
import { TxFill } from "./Tx";

const EU = UI.evidenceUi;

export function OverspendScope({ run }: { readonly run: HarnessRun }): ReactElement | null {
  const b2 = run.baselines.B2?.rates["overspend_rate"] ?? null;
  const target = run.acceptance?.find((row) => row.id === "T-H1") ?? null;
  if (b2 === null || target === null || target.result.n === b2.n) return null;
  return (
    <p className="ev-big__scope" data-scope-note="overspend">
      <TxFill
        text={EU.overspendScope}
        slots={{
          b: <span data-ident>B2</span>,
          k: <EvNum chip={b2.chip}>{b2.k}</EvNum>,
          n: <EvNum chip={b2.chip}>{b2.n}</EvNum>,
          id: <span data-ident>{target.id}</span>,
          m: <EvNum chip={target.result.chip}>{target.result.n}</EvNum>,
        }}
      />
    </p>
  );
}
