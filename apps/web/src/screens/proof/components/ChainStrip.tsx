// The receipt chain as a strip of links: grey before a check, green when verified, red where it broke, dashed after a
// break (not checked). Decorative: the card next to it says the same in words.
import type { CSSProperties, ReactElement } from "react";
import { cx } from "../../../ui/cx";
import { chainWindow, linkStates } from "../verifyWords";

export const MAX_LINKS = 24;
/** The whole wipe takes about this long however many links there are (a short log is not slower). */
const WIPE_MS = 600;
const MAX_STEP_MS = 60;

export function ChainStrip({ total, result, runKey }: {
  readonly total: number;
  readonly result: { readonly ok: true } | { readonly ok: false; readonly failedSeq: number } | null;
  /** Changes on every new check, so the strip replays its fill once. */
  readonly runKey: string;
}): ReactElement | null {
  const window = chainWindow(total, result && !result.ok ? result.failedSeq : null, MAX_LINKS);
  const states = linkStates(window, result);
  if (states.length === 0) return null;
  const step = Math.min(MAX_STEP_MS, Math.round(WIPE_MS / states.length));
  return (
    <div className="pf-chain" aria-hidden="true" data-chain key={runKey} style={{ ["--pf-stagger" as string]: `${step}ms` } as CSSProperties}>
      {window.start > 0 ? <span className="pf-chain__more" /> : null}
      {states.map((s, i) => <span key={window.start + i} className={cx("pf-chain__link", `pf-chain__link--${s}`)} style={{ ["--i" as string]: i }} data-link={s} />)}
      {window.end < total ? <span className="pf-chain__more" /> : null}
    </div>
  );
}
