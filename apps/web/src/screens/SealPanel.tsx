// Seal (docs/04 Screens, PACKET): MandateEditor over a PacketMeter preview; Seal writes MANDATE_SEALED.
import { useMemo, useState, type ReactElement } from "react";
import { MandateEditor } from "../components/MandateEditor";
import { PacketMeter } from "../components/PacketMeter";
import { chipsToRules, compileMandate, M0_SENTENCE, sealRequestFrom, type RuleChip } from "../booth/compile";
import { SIMULATED } from "../domain/provenance";
import { useBoothContext } from "../hooks/useBooth";
import type { PacketState } from "../api/types";

function previewPacket(chips: readonly RuleChip[]): PacketState | null {
  if (chips.some((c) => !c.valid)) return null;
  const rules = chipsToRules(chips);
  const budget = rules.budget.amount_minor;
  return {
    mandate_id: "mnd_preview", log_id: "log_preview", budget_minor: budget, committed_minor: 0, spent_minor: 0, remaining_minor: budget, currency: "HKD",
    active_cards: [], mint_times: [], open_escalations: [], status: "ACTIVE", expires_at: new Date(0).toISOString(), folded_through_seq: 0, computed_at: new Date(0).toISOString(),
  };
}

export function SealPanel(): ReactElement {
  const { state, busy, seal } = useBoothContext();
  const [sentence, setSentence] = useState(state.intentText ?? M0_SENTENCE);
  const [chips, setChips] = useState<readonly RuleChip[]>(() => compileMandate(sentence, new Date()).chips);
  const [version, setVersion] = useState(0);
  const preview = useMemo(() => previewPacket(chips), [chips]);
  const sealedNow = state.mandate !== null && state.mandate.intent_text === sentence && !state.revoked && state.log.entries.length <= 1;

  return (
    <section className="seal" data-register="packet" aria-label="Seal">
      <MandateEditor
        value={sentence}
        compiled={chips}
        chipsVersion={version}
        sealing={busy}
        sealed={sealedNow}
        onValueChange={(next) => {
          setSentence(next);
          setChips(compileMandate(next, new Date()).chips);
          setVersion((n) => n + 1);
        }}
        onChipChange={(next) => setChips((all) => all.map((c) => (c.kind === next.kind ? next : c)))}
        onSeal={() => void seal(sealRequestFrom(sentence, chips, new Date()))}
      />
      {preview ? <PacketMeter packet={preview} prov={SIMULATED} /> : null}
    </section>
  );
}
