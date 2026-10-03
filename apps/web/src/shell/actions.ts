// Shell actions over the booth: every call goes through booth.exec, so a failure shows the shell's message and mints
// nothing (I5). attempt() also says whether the call went through, for the success toast or the next step.
import { useCallback, useMemo } from "react";
import type { RunSummary, ScenarioId } from "../api/types";
import { useBoothContext, type Booth } from "../hooks/useBooth";
import { navigate, PARAM } from "../hooks/useRoute";
import { STAYS_ON_BUDGET } from "../screens/home/tryCatalog";
import { noteAsk } from "../screens/run/askEcho";
import { useLocale } from "../ui/locale";

export async function attempt(booth: Pick<Booth, "exec">, task: () => Promise<unknown>): Promise<boolean> {
  let ok = false;
  await booth.exec(async () => {
    await task();
    ok = true;
  });
  return ok;
}

/** Runs after React has painted the latest state (two frames), e.g. once a new card has pushed the layout down. */
export function afterPaint(fn: () => void): void {
  if (typeof requestAnimationFrame !== "function") {
    setTimeout(fn, 0);
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Brings "Manage this budget" (cards and Cancel this budget) into view and gives it focus. */
export function revealConsole(): void {
  const el = document.getElementById("budget-console");
  if (!el) return;
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  el.focus({ preventScroll: true });
}

/** Runs a scenario and shows where its result appears: Wally's screen, or the Budget console for Cancel the budget. */
export function useScenarioRunner(): (id: ScenarioId) => void {
  const booth = useBoothContext();
  const { runScenario } = booth;
  return useCallback(
    (id: ScenarioId) => {
      const onBudget = STAYS_ON_BUDGET.has(id);
      if (onBudget) navigate("budget", { [PARAM.focus]: "console" });
      else navigate("wally");
      void runScenario(id).then(() => {
        if (onBudget) afterPaint(revealConsole);
      });
    },
    [runScenario],
  );
}

/** Sends visitor text as a listing description ("Try to trick Wally") and shows Wally at work. */
export function useProposer(): (listingText: string) => void {
  const { propose } = useBoothContext();
  return useCallback(
    (listingText: string) => {
      navigate("wally");
      void propose({ listingText });
    },
    [propose],
  );
}

/**
 * Ask Wally in the shopper's own words: the text goes to api.ask with the screen language and Wally's screen shows the
 * run. Resolves with the run once it has ended (undefined if the call failed, which the shell has already said).
 * undefined when this booth cannot take a typed ask (info.features.ask is off, or the client has no ask), so the
 * Ask sheet shows no field.
 */
export function useAsker(): ((requestText: string) => Promise<RunSummary | undefined>) | undefined {
  const { api, info, exec } = useBoothContext();
  const { locale } = useLocale();
  const ask = api.ask;
  const available = info?.features?.ask === true && typeof ask === "function";
  return useMemo(() => {
    if (!available || !ask) return undefined;
    return async (requestText: string): Promise<RunSummary | undefined> => {
      navigate("wally");
      let run: RunSummary | undefined;
      await exec(async () => {
        try {
          run = await ask.call(api, { requestText, locale });
        } catch (err) {
          // The caller noted these words for a run that never started: drop them, so the next run does not wear them.
          noteAsk("");
          throw err;
        }
      });
      return run;
    };
  }, [available, ask, api, exec, locale]);
}
