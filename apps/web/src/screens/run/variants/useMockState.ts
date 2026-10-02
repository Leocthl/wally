// Real booth state for the variant harness: the offline MockApiClient plays booth scenarios instantly and every trace
// event is folded with the app's own reducer, so a variant renders exactly the Result the Wally screen would get.
import { useEffect, useState } from "react";
import { MockApiClient } from "../../../api/MockApiClient";
import type { ScenarioId, TraceEvent } from "../../../api/types";
import { m0Request } from "../../../booth/compile";
import { initialState, reduce, type BoothState } from "../../../state/booth";
import { selectScreen, type Result } from "../model/screen";

export interface MockPlay {
  readonly state: BoothState;
  readonly result: Result | null;
}

/** Runs the scenarios in order on a fresh sealed budget; `key` replays them (a new run, a new countdown). */
export function useMockState(scenarios: readonly ScenarioId[], key: number): MockPlay | null {
  const [play, setPlay] = useState<MockPlay | null>(null);
  const ids = scenarios.join(",");
  useEffect(() => {
    let alive = true;
    setPlay(null);
    const events: TraceEvent[] = [];
    const api = new MockApiClient({ sleep: async () => undefined, pace: 0 });
    api.subscribe((e) => events.push(e));
    const fold = (): BoothState => events.reduce<BoothState>((s, e) => reduce(s, e), initialState());
    void (async () => {
      await api.seal(m0Request(new Date()));
      for (const id of ids.split(",").filter(Boolean)) await api.runScenario(id as ScenarioId);
      if (!alive) return;
      const state = fold();
      const model = selectScreen(state);
      setPlay({ state, result: model.kind === "result" ? model.result : null });
    })();
    return () => {
      alive = false;
      api.dispose();
    };
  }, [ids, key]);
  return play;
}
