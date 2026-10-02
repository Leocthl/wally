// REAL mode (docs/06): replays the one OBSERVED decline from the real-card test. Read only, redacted (I8), never a live rail.
import type { ReactElement } from "react";
import type { RealCapture } from "../api/types";
import { observed } from "../domain/provenance";
import { ProvChip } from "./ProvChip";

export function RealCapturePanel({ capture }: { readonly capture: RealCapture }): ReactElement {
  return (
    <section className="card" data-register="ledger" aria-label="Real decline capture">
      <ProvChip prov={observed(capture.capturedAt, "data/real-card-test.md")} />
      <p>
        Decline code <code data-ident>{capture.declineCode}</code>
      </p>
      <p className="soft">{capture.note}</p>
    </section>
  );
}
