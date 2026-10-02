// Figures: ProgressBar, Ring and Stat. The value text is the caller's formatted figure (HK$ with separators); the
// bar and ring carry it in aria-valuetext, so a screen reader hears the amount, not a percentage.
import type { ReactElement, ReactNode } from "react";
import "../design/ui/data.css";
import { cx } from "./cx";

export type Meterish = "progressbar" | "meter";
export type DataTone = "primary" | "ok" | "warn" | "stop" | "accent" | "on-hero";

function clampRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export { clampRatio };

export interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  /** Accessible name, e.g. "Budget left". */
  readonly label: string;
  /** Spoken value, e.g. "HK$541 left of HK$800". */
  readonly valueText: string;
  readonly tone?: DataTone;
  /** "meter" for a level such as budget left; "progressbar" for a task in progress. */
  readonly role?: Meterish;
  readonly size?: "sm" | "md";
  readonly className?: string;
}

export function ProgressBar({ value, max, label, valueText, tone = "primary", role = "progressbar", size = "md", className }: ProgressBarProps): ReactElement {
  const ratio = clampRatio(value, max);
  return (
    <div
      className={cx("w-progress", `w-progress--${tone}`, `w-progress--${size}`, className)}
      role={role}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      aria-valuetext={valueText}
    >
      <span className="w-progress__fill" style={{ width: `${(ratio * 100).toFixed(2)}%` }} />
    </div>
  );
}

export interface RingProps extends Omit<ProgressBarProps, "size"> {
  /** Diameter in px. */
  readonly size?: number;
  readonly thickness?: number;
  readonly children?: ReactNode;
}

export function Ring({ value, max, label, valueText, tone = "primary", role = "meter", size = 88, thickness = 8, children, className }: RingProps): ReactElement {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = clampRatio(value, max);
  return (
    <div
      className={cx("w-ring", `w-ring--${tone}`, className)}
      style={{ width: size, height: size }}
      role={role}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
      aria-valuetext={valueText}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle className="w-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={thickness} fill="none" />
        <circle
          className="w-ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={(circumference * (1 - ratio)).toFixed(2)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children ? <span className="w-ring__center">{children}</span> : null}
    </div>
  );
}

export interface StatProps {
  readonly label: ReactNode;
  /** The formatted figure, e.g. "HK$541". */
  readonly value: string;
  readonly sub?: ReactNode;
  readonly delta?: { readonly text: string; readonly tone: "ok" | "stop" | "neutral" };
  /** Provenance chip slot (quiet). */
  readonly chip?: ReactNode;
  readonly size?: "md" | "lg" | "xl";
  readonly onHero?: boolean;
  readonly className?: string;
}

export function Stat({ label, value, sub, delta, chip, size = "lg", onHero = false, className }: StatProps): ReactElement {
  return (
    <div className={cx("w-stat", `w-stat--${size}`, onHero && "w-stat--on-hero", className)}>
      <span className="w-stat__label">{label}</span>
      <span className="w-stat__row">
        <span className="w-stat__value" data-selectable>{value}</span>
        {delta ? <span className={cx("w-stat__delta", `w-stat__delta--${delta.tone}`)}>{delta.text}</span> : null}
      </span>
      {sub || chip ? (
        <span className="w-stat__sub">
          {sub}
          {chip}
        </span>
      ) : null}
    </div>
  );
}
