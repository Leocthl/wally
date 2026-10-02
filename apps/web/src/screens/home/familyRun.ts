// Mum's budget on Budget ("Try asking"). family_ok runs like every other scenario and ends on Wally with the purchase.
// family_over is refused before anything is sealed, so there is no purchase to show: the screen stays on Budget, where the
// budget held now is plainly unchanged, and a toast says what Mum allows.
import { useCallback } from "react";
import type { ScenarioId } from "../../api/types";
import { formatHkd } from "../../domain/money";
import { useBoothContext } from "../../hooks/useBooth";
import { UI } from "../../i18n/ui";
import { fillText } from "../../shell/figures";
import { haptic } from "../../ui/haptics";
import { useLocale } from "../../ui/locale";
import { useToast } from "../../ui/Toast";

const F = UI.family;

export function useFamilyRunner(run: (id: ScenarioId) => void): (id: ScenarioId) => void {
  const { api, exec } = useBoothContext();
  const toast = useToast();
  const { t } = useLocale();
  return useCallback(
    (id) => {
      if (id !== "family_over") return run(id);
      void exec(async () => {
        const result = await api.runScenario(id);
        if (result.code !== "EXCEEDS_PARENT") return;
        const mum = await api.family?.().catch(() => null);
        const message = mum ? `${fillText(t(F.overCap), { cap: formatHkd(mum.ceilingMinor) })}. ${t(F.refusedNote)}` : t(F.refused);
        toast.show({ message, tone: "stop" });
        haptic("stop");
      });
    },
    [api, exec, run, t, toast],
  );
}
