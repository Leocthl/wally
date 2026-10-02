// Num: the only way a figure reaches the screen (docs/04 "No bare number"). Value plus its provenance chip.
// A missing provenance fails closed to the text UNKNOWN: an unlabelled figure is a fabrication (CLAUDE.md).
import type { ReactElement } from "react";
import { formatHkd } from "../domain/money";
import type { Prov } from "../domain/provenance";
import { formatHkTime } from "../domain/time";
import { useScopeCovers } from "./ChipScope";
import { ProvChip } from "./ProvChip";

export type NumKind = "money" | "prob" | "count" | "ms" | "seconds" | "time";

const PROB_DIGITS = 2;

export function formatNum(kind: NumKind, value: number | string): string {
  switch (kind) {
    case "money":
      return formatHkd(Number(value));
    case "prob":
      return Number(value).toFixed(PROB_DIGITS);
    case "ms":
      return `${Math.round(Number(value))} ms`;
    case "seconds":
      return `${Math.round(Number(value))} s`;
    case "time":
      return formatHkTime(String(value));
    case "count":
      return String(Math.round(Number(value)));
  }
}

export interface NumProps {
  readonly kind: NumKind;
  /** Minor units for money, a probability in 0..1, a count, milliseconds, seconds, or an ISO time. */
  readonly value: number | string;
  /** Required. Undefined renders UNKNOWN and no figure. */
  readonly prov: Prov | undefined;
  /** "scope" relies on an enclosing ChipScope that shows the same chip; falls back to inline otherwise. */
  readonly chip?: "inline" | "scope";
  readonly className?: string;
}

export function Num({ kind, value, prov, chip = "inline", className }: NumProps): ReactElement {
  const covered = useScopeCovers(prov ?? { kind: "SIMULATED" });
  if (!prov) {
    return (
      <span className={`num num--unknown ${className ?? ""}`.trim()} data-num data-prov="UNKNOWN">
        UNKNOWN
      </span>
    );
  }
  const showChip = chip === "inline" || !covered;
  return (
    <span className={`num ${className ?? ""}`.trim()} data-num data-kind={kind} data-prov={prov.kind}>
      <span className="num__v">{formatNum(kind, value)}</span>
      {showChip ? <ProvChip prov={prov} /> : null}
    </span>
  );
}
