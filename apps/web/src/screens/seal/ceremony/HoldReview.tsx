// Seal variant "Hold" (axis: how much weight the press carries). The lock is the control: press and hold it and the
// shackle comes down with your finger (1:1), a ring fills around it, and at the end it clunks shut. Let go early and the
// shackle rises again (fast: release is quicker than the press). Keyboard: hold Space or Enter.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";
import { HOLD_MS } from "../../../design/motion";
import { CEREMONY } from "../../../i18n/ceremony";
import { UI } from "../../../i18n/ui";
import { haptic } from "../../../ui/haptics";
import { useLocale } from "../../../ui/locale";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import type { RulesForm } from "../sealModel";
import { SealLock } from "../SealLock";
import { RulesSummary } from "../SealSteps";
import "./ceremony.css";

const RING = 148;
const RADIUS = 66;
const CIRC = 2 * Math.PI * RADIUS;
const RELEASE_MS = 220;

export interface ReviewVariantProps {
  readonly form: RulesForm;
  /** idle: waiting. sealed: the budget is signed. */
  readonly sealed: boolean;
  readonly onSeal: () => void;
}

/** Progress 0..1 that follows a hold: up at hold speed while pressed, down faster after a release. */
function useHoldProgress(onDone: () => void, enabled: boolean): { readonly progress: number; readonly start: () => void; readonly stop: () => void } {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);
  const holding = useRef(false);
  const last = useRef(0);
  const value = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;
  const reduced = useReducedMotion();

  const tick = useCallback((now: number) => {
    const dt = now - last.current;
    last.current = now;
    const speed = holding.current ? dt / HOLD_MS : -dt / RELEASE_MS;
    value.current = Math.min(1, Math.max(0, value.current + (reduced && holding.current ? 0 : speed)));
    setProgress(value.current);
    if (value.current >= 1 && holding.current) {
      holding.current = false;
      haptic("success");
      done.current();
      raf.current = null;
      return;
    }
    raf.current = value.current <= 0 && !holding.current ? null : window.requestAnimationFrame(tick);
  }, [reduced]);

  const run = (): void => {
    if (raf.current === null) {
      last.current = performance.now();
      raf.current = window.requestAnimationFrame(tick);
    }
  };
  const start = (): void => {
    if (!enabled || holding.current) return;
    holding.current = true;
    haptic("tap");
    run();
  };
  const stop = (): void => {
    holding.current = false;
    run();
  };
  useEffect(() => () => {
    if (raf.current !== null) window.cancelAnimationFrame(raf.current);
  }, []);
  return { progress, start, stop };
}

export function HoldReview({ form, sealed, onSeal }: ReviewVariantProps): ReactElement {
  const { t } = useLocale();
  const { progress, start, stop } = useHoldProgress(onSeal, !sealed);
  const shown = sealed ? 1 : progress;
  const key = (e: KeyboardEvent<HTMLButtonElement>): boolean => e.key === " " || e.key === "Enter";
  return (
    <div className="seal-step seal-review cer-hold" data-sealed={sealed || undefined}>
      <button
        type="button"
        className="cer-hold__control"
        aria-label={t(CEREMONY.holdToSeal)}
        disabled={sealed}
        onPointerDown={(e: PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture?.(e.pointerId); start(); }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => { if (key(e) && !e.repeat) { e.preventDefault(); start(); } }}
        onKeyUp={(e) => { if (key(e)) stop(); }}
        onBlur={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg className="cer-hold__ring" width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true" focusable="false">
          <circle className="cer-hold__track" cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" strokeWidth={8} />
          <circle className="cer-hold__fill" cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" strokeWidth={8} strokeLinecap="round" strokeDasharray={CIRC.toFixed(2)} strokeDashoffset={(CIRC * (1 - shown)).toFixed(2)} transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
        </svg>
        <SealLock locked={sealed} size={96} className="cer-hold__lock" {...(sealed ? {} : { shackle: progress })} />
      </button>
      <p className="cer-hold__label">{sealed ? t(CEREMONY.sealed) : t(CEREMONY.holdToSeal)}</p>
      <RulesSummary form={form} signed={sealed} />
      <p className="seal-lead seal-review__lead">{sealed ? t(UI["seal.sealedBody"]) : t(CEREMONY.holdHint)}</p>
    </div>
  );
}
