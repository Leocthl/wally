// What happens to the words typed (or said) in the Ask field.
//  - A host with a live planner (the booth, with the local model or the rule planner): the words go to Wally, who shops over
//    the whole demo shelf; Wally's screen shows the run. If Wally cannot pick an item, the reader takes over, so the shopper
//    gets matches to choose from instead of a dead end.
//  - A host without one (the on-device page, GitHub Pages, the native shells, a booth on the recorded planner): no ask is
//    sent. The fixed keyword reader finds the items in the demo shop and the shopper picks one; the rules decide as always.
import { useMemo } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { navigate } from "../../hooks/useRoute";
import { afterPaint, useAsker } from "../../shell/actions";
import { noteAsk } from "../run/askEcho";
import { useShopSearch } from "./usePhotoEntry";
import { couldNotPick } from "./typedAsk";

export type TypedAsk = (text: string) => void;

export function useTypedAsk(): TypedAsk | undefined {
  const { info } = useBoothContext();
  const live = useAsker();
  const search = useShopSearch();
  // Recorded answers only: the on-device page, and a booth running the recorded planner. Nothing there can choose among the shelf.
  const recordedOnly = info?.kind === "local" || info?.planner.provider === "replay";
  return useMemo<TypedAsk | undefined>(() => {
    if (search !== undefined && (recordedOnly || live === undefined)) return search;
    if (live === undefined) return undefined;
    return (text) => {
      noteAsk(text);
      void live(text).then((run) => {
        if (search === undefined || !couldNotPick(run)) return;
        // Leave Wally's "couldn't pick" screen behind and show what the reader found, over the budget.
        navigate("budget");
        afterPaint(() => search(text));
      });
    };
  }, [live, search, recordedOnly]);
}
