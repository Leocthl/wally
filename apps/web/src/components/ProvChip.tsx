// Provenance chip (docs/04): OBSERVED teal with a filled dot, SIMULATED inverse fill with a hatched edge (largest),
// MEASURED blue with a tick, ASSUMED brown-grey with a dashed edge. Text is always present, colour never alone.
import type { ReactElement } from "react";
import { chipText, type Prov } from "../domain/provenance";
import { IconDot, IconTick } from "./icons";

const CLASS_BY_KIND = {
  OBSERVED: "chip chip--obs",
  SIMULATED: "chip chip--sim",
  MEASURED: "chip chip--meas",
  ASSUMED: "chip chip--asm",
} as const;

export function ProvChip({ prov }: { readonly prov: Prov }): ReactElement {
  return (
    <span className={CLASS_BY_KIND[prov.kind]} data-chip data-prov={prov.kind}>
      {prov.kind === "OBSERVED" ? <IconDot /> : null}
      {prov.kind === "MEASURED" ? <IconTick /> : null}
      <span className="chip__text">{chipText(prov)}</span>
    </span>
  );
}
