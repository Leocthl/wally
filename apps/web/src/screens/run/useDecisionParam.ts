// The decision to show, from the route: #/wally?d=<decisionId> (Recent rows and Receipts link here; the first links'
// ?decision= reads the same). The shell owns navigation; this reads the shared route store and can drop the query in
// place (replaceState, no new history entry) once a newer run has taken the screen over, so tapping the same row
// again pins it again.
import { useCallback } from "react";
import { decisionIdOf, navigate, parseHash, PARAM, receiptHref, useRoute, wallyHref } from "../../hooks/useRoute";

export { receiptHref, wallyHref };

export function useDecisionParam(): readonly [string | undefined, () => void] {
  const route = useRoute();
  const id = decisionIdOf(route.params) ?? undefined;
  const clear = useCallback(() => {
    const kept = Object.entries(parseHash(window.location.hash).route.params).filter(([key]) => key !== PARAM.decision);
    navigate("wally", Object.fromEntries(kept), { replace: true });
  }, []);
  return [id, clear] as const;
}
