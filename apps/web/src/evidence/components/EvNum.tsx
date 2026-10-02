// Figures on the Evidence screen. Same contract as Num and ChipScope (docs/04 "No bare number"), but the chip is the
// result file's own text, verbatim, including RECORDED(...) which the app-wide Prov type does not carry.
import { createContext, useContext, type ReactElement, type ReactNode } from "react";
import { CHIP_CLASS, type FileChip } from "../chip";
import { IconDot, IconTick } from "../../components/icons";

const ScopeContext = createContext<readonly string[]>([]);

export function EvChip({ chip }: { readonly chip: FileChip }): ReactElement {
  return (
    <span className={CHIP_CLASS[chip.kind]} data-chip data-prov={chip.kind}>
      {chip.kind === "OBSERVED" ? <IconDot /> : null}
      {chip.kind === "MEASURED" ? <IconTick /> : null}
      <span className="chip__text">{chip.text}</span>
    </span>
  );
}

/** A figure with its chip; the chip is left out only when an enclosing EvScope shows the identical chip text. */
export function EvNum({ chip, children, className }: { readonly chip: FileChip | null; readonly children: ReactNode; readonly className?: string }): ReactElement {
  const covered = useContext(ScopeContext);
  if (chip === null) {
    return (
      <span className="num num--unknown" data-num data-prov="UNKNOWN">
        UNKNOWN
      </span>
    );
  }
  return (
    <span className={`num ${className ?? ""}`.trim()} data-num data-prov={chip.kind}>
      <span className="num__v">{children}</span>
      {covered.includes(chip.text) ? null : <> <EvChip chip={chip} /></>}
    </span>
  );
}

/** One chip row for a block whose figures share provenance (docs/04: one chip may sit in a header). */
export function EvScope({ chips, children, className }: { readonly chips: readonly FileChip[]; readonly children: ReactNode; readonly className?: string }): ReactElement {
  const outer = useContext(ScopeContext);
  const unique = chips.filter((c, i) => chips.findIndex((d) => d.text === c.text) === i);
  return (
    <ScopeContext.Provider value={[...outer, ...unique.map((c) => c.text)]}>
      <div className={`chip-scope ${className ?? ""}`.trim()} data-chip-scope>
        <span className="chip-scope__chips">
          {unique.map((c) => (
            <EvChip key={c.text} chip={c} />
          ))}
        </span>
        {children}
      </div>
    </ScopeContext.Provider>
  );
}
