// The seal moment as one hook, for Seal and for the first run: sign the budget through the booth, fire the haptic on the
// frame the lock closes, then say when the moment has played (--dur-ceremony; 0 under reduced motion) so the screen can
// hand over to the sealed state. Sealing always goes through api.seal (SealRequest unchanged); nothing seals by itself.
import { useEffect, useState } from "react";
import type { SealRequest } from "../../api/types";
import { cssDurationMs } from "../../design/motion";
import { useBoothContext } from "../../hooks/useBooth";
import { attempt } from "../../shell/actions";
import { haptic } from "../../ui/haptics";
import type { RulesForm } from "./sealModel";

export interface SealCeremony {
  /** The seal call is in flight. */
  readonly sealing: boolean;
  /** The rules that were sealed, once it went through; null before. */
  readonly sealedForm: RulesForm | null;
  /** The lock has closed and its moment has played: show the sealed screen. */
  readonly settled: boolean;
  /** Seals what `build` makes. Resolves true when the booth accepted it; a refusal shows the shell's message and stays put. */
  readonly seal: (build: (at: Date) => SealRequest, form: RulesForm) => Promise<boolean>;
}

export function useSealCeremony(): SealCeremony {
  const booth = useBoothContext();
  const [sealing, setSealing] = useState(false);
  const [sealedForm, setSealedForm] = useState<RulesForm | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (sealedForm === null) return undefined;
    const timer = window.setTimeout(() => setSettled(true), cssDurationMs("--dur-ceremony"));
    return () => window.clearTimeout(timer);
  }, [sealedForm]);

  const seal = async (build: (at: Date) => SealRequest, form: RulesForm): Promise<boolean> => {
    const at = new Date();
    setSealing(true);
    const ok = await attempt(booth, () => booth.api.seal(build(at)));
    setSealing(false);
    if (!ok) return false;
    // The haptic and the lock close on the same frame (apple-design: causality and harmony).
    haptic("success");
    setSealedForm(form);
    return true;
  };

  return { sealing, sealedForm, settled, seal };
}
