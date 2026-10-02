// A column or card whose figures share a provenance may carry the chip once, in its header (docs/04 Provenance chips).
// Num with chip="scope" is only trusted when an enclosing scope really shows the same chip; otherwise it renders inline.
import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { chipText, type Prov } from "../domain/provenance";
import { ProvChip } from "./ProvChip";

const ChipScopeContext = createContext<readonly string[]>([]);

export function useScopeCovers(prov: Prov): boolean {
  return useContext(ChipScopeContext).includes(chipText(prov));
}

export interface ChipScopeProps {
  readonly provs: readonly Prov[];
  readonly children: ReactNode;
  readonly className?: string;
  /** Where the chips sit. "start" is the header position. */
  readonly place?: "start" | "end";
  /** Extra class for the chip row, e.g. to turn the chip into a stamp. */
  readonly chipsClassName?: string;
}

export function ChipScope({ provs, children, className, place = "start", chipsClassName }: ChipScopeProps): ReactElement {
  const outer = useContext(ChipScopeContext);
  const keys = [...outer, ...provs.map(chipText)];
  const chips = (
    <span className={`chip-scope__chips ${chipsClassName ?? ""}`.trim()}>
      {provs.map((p) => (
        <ProvChip key={chipText(p)} prov={p} />
      ))}
    </span>
  );
  return (
    <ChipScopeContext.Provider value={keys}>
      <div className={`chip-scope ${className ?? ""}`.trim()} data-chip-scope>
        {place === "start" ? chips : null}
        {children}
        {place === "end" ? chips : null}
      </div>
    </ChipScopeContext.Provider>
  );
}
