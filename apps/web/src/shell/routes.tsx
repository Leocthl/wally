// The route table. Budget renders at once (it is the landing screen); every other screen is its own chunk, loaded on
// first visit and prefetched while the visitor reads Budget. Other lanes replace the contents of the files these lazy
// imports point at and keep the export names: RunScreen, ReceiptsScreen, ProofScreen, EvidenceScreen, PresenterScreen.
import { lazy, type ReactElement } from "react";
import type { Route, RouteName } from "../hooks/useRoute";
import { BudgetScreen } from "../screens/home/BudgetScreen";
import type { SuggestRules } from "../screens/seal/sealModel";

const LOADERS = {
  wally: () => import("../screens/run/RunScreen").then((m) => ({ default: m.RunScreen })),
  receipts: () => import("../screens/proof/ReceiptsScreen").then((m) => ({ default: m.ReceiptsScreen })),
  proof: () => import("../screens/proof/ProofScreen").then((m) => ({ default: m.ProofScreen })),
  evidence: () => import("../screens/EvidenceScreen").then((m) => ({ default: m.EvidenceScreen })),
  presenter: () => import("../screens/PresenterScreen").then((m) => ({ default: m.PresenterScreen })),
  seal: () => import("../screens/seal/SealScreen").then((m) => ({ default: m.SealScreen })),
} as const;

const RunScreen = lazy(LOADERS.wally);
const ReceiptsScreen = lazy(LOADERS.receipts);
const ProofScreen = lazy(LOADERS.proof);
const EvidenceScreen = lazy(LOADERS.evidence);
const PresenterScreen = lazy(LOADERS.presenter);
const SealScreen = lazy(LOADERS.seal);

/** Warm the chunks a visitor is likely to open next (Wally after Try asking, then the rest), when the page is idle. */
export function prefetchRoutes(names: readonly (keyof typeof LOADERS)[] = ["wally", "receipts", "proof", "seal"]): void {
  for (const name of names) void LOADERS[name]().catch(() => undefined);
}

export interface RouteViewProps {
  readonly route: Route;
  readonly suggestRules?: SuggestRules;
}

export function RouteView({ route, suggestRules }: RouteViewProps): ReactElement {
  switch (route.name) {
    case "wally":
      return <RunScreen />;
    case "receipts":
      return <ReceiptsScreen />;
    case "proof":
      return <ProofScreen />;
    case "evidence":
      return <EvidenceScreen />;
    case "presenter":
      return <PresenterScreen />;
    case "seal":
      return <SealScreen {...(suggestRules ? { suggestRules } : {})} />;
    case "budget":
    case "styleguide":
      return <BudgetScreen />;
  }
}

/** Which tab is lit for a route: sub-screens light their parent (Evidence is reached from Proof). */
export function tabFor(name: RouteName): string {
  if (name === "evidence") return "proof";
  if (name === "seal" || name === "presenter" || name === "styleguide") return "";
  return name;
}
