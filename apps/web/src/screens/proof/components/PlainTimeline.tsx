// "Your receipts, in order" on plain Proof: the receipts being checked (the changed copy during the demo), oldest first, one
// row each. Before a check every row is neutral; after it, rows are untouched up to a change, changed at it, and not
// checked after it. Amounts and times sit under one SIMULATED chip, unless a cart says otherwise.
import { useMemo, type ReactElement } from "react";
import type { LogEntry, VerifyOutcome } from "../../../api/types";
import { ChipScope } from "../../../components/ChipScope";
import { SIMULATED } from "../../../domain/provenance";
import { useLocale } from "../../../ui/locale";
import { PLAIN } from "../plainStrings";
import { rowStatuses } from "../plainWords";
import { useStableReceipts } from "../useStableReceipts";
import { PlainTimelineRow } from "./PlainTimelineRow";
import type { ProofStatus } from "./VerifyCard";

export interface PlainTimelineProps {
  readonly entries: readonly LogEntry[];
  readonly outcome: VerifyOutcome | null;
  readonly status: ProofStatus;
}

export function PlainTimeline({ entries, outcome, status }: PlainTimelineProps): ReactElement {
  const { t } = useLocale();
  const receipts = useStableReceipts(entries);
  // A verdict colours the rows only while it is on screen as the card's verdict; while checking, every row is neutral again.
  const verdict = status === "pass" || status === "fail" ? (outcome?.result ?? null) : null;
  const states = useMemo(() => rowStatuses(entries.map((e) => e.seq), verdict), [entries, verdict]);
  const failure = verdict !== null && !verdict.ok ? verdict.reason : null;
  return (
    <ChipScope provs={[SIMULATED]} className="pf-tl__scope" chipsClassName="pf-tl__chips">
      <h2 className="pf-tl__heading">{t(PLAIN.timelineTitle)}</h2>
      <ol className="pf-tl">
        {entries.map((entry, i) => {
          const receipt = receipts[i];
          if (receipt === undefined) return null;
          const state = states[i] ?? "idle";
          return <PlainTimelineRow key={entry.seq} entry={entry} receipt={receipt} status={state} code={state === "changed" ? failure : null} />;
        })}
      </ol>
    </ChipScope>
  );
}
