// Tag (a quiet label such as "Clothes" or "Verified sellers") and ProvenanceChip (the same props as ProvChip, the same
// .chip classes and data attributes, so phase B can swap it in and the "no number without a chip" tests still see it).
import type { ReactElement, ReactNode } from "react";
import "../design/ui/chip.css";
import { chipText, type Prov } from "../domain/provenance";
import { cx } from "./cx";
import { Icon } from "./icons";

export type TagTone = "neutral" | "primary" | "accent" | "ok" | "warn" | "stop" | "info" | "on-hero";

export interface TagProps {
  readonly children: ReactNode;
  readonly tone?: TagTone;
  readonly icon?: ReactNode;
  readonly size?: "sm" | "md";
  readonly className?: string;
  readonly lang?: string;
}

export function Tag({ children, tone = "neutral", icon, size = "md", className, lang }: TagProps): ReactElement {
  return (
    <span className={cx("w-tag", `w-tag--${tone}`, `w-tag--${size}`, className)} lang={lang}>
      {icon ? <span className="w-tag__icon">{icon}</span> : null}
      {children}
    </span>
  );
}

const CLASS_BY_KIND = { OBSERVED: "chip--obs", SIMULATED: "chip--sim", MEASURED: "chip--meas", ASSUMED: "chip--asm" } as const;

function ProvGlyph({ prov }: { readonly prov: Prov }): ReactElement | null {
  if (prov.kind === "OBSERVED") return <Icon name="eye" size={12} strokeWidth={2.4} />;
  if (prov.kind === "MEASURED") return <Icon name="check" size={12} strokeWidth={2.6} />;
  return null;
}

export interface ProvenanceChipProps {
  readonly prov: Prov;
  readonly size?: "sm" | "lg";
  readonly className?: string;
}

/** Exact chip text from docs/04 (chipText); shape cues so colour is never the only signal. */
export function ProvenanceChip({ prov, size = "sm", className }: ProvenanceChipProps): ReactElement {
  return (
    <span className={cx("chip", CLASS_BY_KIND[prov.kind], size === "lg" && "chip--lg", className)} data-chip data-prov={prov.kind}>
      <ProvGlyph prov={prov} />
      <span className="chip__text">{chipText(prov)}</span>
    </span>
  );
}
