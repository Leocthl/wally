// The bars of one card, one per layer: rules only, Wally, and an AI on its own for reference. Each bar is a share of its
// own whole (so 41 of 84 is about half), drawn once when the card first shows, and always has its name and count beside
// it: the pattern is decoration, never the only signal.
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { LabelPair } from "../../../i18n/label";
import { useReveal } from "../../useReveal";
import { Tx } from "../Tx";

export interface BarRow {
  readonly id: string;
  readonly name: LabelPair;
  /** 0 to 1: how much of the track is filled. */
  readonly share: number;
  /** wally: solid blue; rules: striped; alone: hatched (an AI on its own, for reference). */
  readonly tone: "wally" | "rules" | "alone";
  /** The count or time in words, already wrapped in its figures. */
  readonly value: ReactNode;
}

/** k out of n as a share of the track; an empty whole fills nothing. */
export function fill(k: number, n: number): number {
  return n > 0 ? Math.min(1, Math.max(0, k / n)) : 0;
}

/** One decimal of a percent, as the bar is drawn: 0.667 gives "66.7". */
const percent = (share: number): string => (share * 100).toFixed(1);

export function PlainBars({ caption, rows }: { readonly caption: LabelPair; readonly rows: readonly BarRow[] }): ReactElement {
  const { ref, reveal } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="evp-bars" data-bars {...(reveal ? { "data-reveal": reveal } : {})}>
      <p className="evp-bars__caption"><Tx text={caption} /></p>
      <ul className="evp-bars__list">
        {rows.map((row, i) => (
          <li key={row.id} className="evp-bar" data-who={row.tone} style={{ ["--order" as string]: i } as CSSProperties}>
            <span className="evp-bar__name"><Tx text={row.name} /></span>{" "}
            <span className="evp-bar__value">{row.value}</span>
            <span className="evp-bar__track" aria-hidden="true">
              <span className="evp-bar__fill" data-share={percent(row.share)} style={{ inlineSize: `${percent(row.share)}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
