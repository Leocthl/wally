// #/proof: two views of one job (check every receipt, show a changed copy being caught, point to the offline checker).
// Plain is the default and checks on its own; developer is the screen with hashes, counts and reason codes. The mode is
// read once, here, before anything is drawn.
import type { ReactElement } from "react";
import { useDisplayMode } from "../../state/displayMode";
import { DeveloperProof } from "./DeveloperProof";
import { PlainProof } from "./PlainProof";

export function ProofScreen(): ReactElement {
  const [mode] = useDisplayMode();
  return mode === "developer" ? <DeveloperProof /> : <PlainProof />;
}
