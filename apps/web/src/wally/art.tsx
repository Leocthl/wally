// Wally's geometry: a rounded wallet with a darker flap, a clasp, a teal card peeking out and a simple face.
// One source for the in-app character (CSS-variable fills) and the generated app icons (fixed fills).
import type { ReactElement } from "react";

export type WallyState = "idle" | "thinking" | "approved" | "stopped" | "offline";
export const WALLY_STATES: readonly WallyState[] = ["idle", "thinking", "approved", "stopped", "offline"];

export interface WallyFills {
  readonly body: string;
  readonly flap: string;
  readonly card: string;
  readonly stripe: string;
  /** Eye whites and smile on the default body; on the inverse body the features use `pupil`. */
  readonly face: string;
  readonly pupil: string;
  readonly shadow: string;
  readonly spark: string;
  readonly stop: string;
  readonly onStop: string;
  readonly muted: string;
}

export const VAR_FILLS: WallyFills = {
  body: "var(--wally-body)",
  flap: "var(--wally-flap)",
  card: "var(--wally-card)",
  stripe: "var(--wally-stripe)",
  face: "var(--wally-face)",
  pupil: "var(--wally-pupil)",
  shadow: "var(--wally-shadow)",
  spark: "var(--c-accent)",
  stop: "var(--c-stop)",
  onStop: "var(--c-on-stop)",
  muted: "var(--c-ink-muted)",
};

export interface WallyArtProps {
  readonly state?: WallyState;
  /** "mini" drops small details so the face reads at 16 to 32 px. */
  readonly detail?: "full" | "mini";
  /** "inverse": white body with navy features, for the blue app icon tile. */
  readonly variant?: "default" | "inverse";
  readonly fills?: WallyFills;
  readonly size?: number;
  /** Omit the ground shadow (icons). */
  readonly shadow?: boolean;
}

function Eyes({ state, f, mini, inverse }: { readonly state: WallyState; readonly f: WallyFills; readonly mini: boolean; readonly inverse: boolean }): ReactElement {
  const line = inverse ? f.pupil : f.face;
  if (state === "approved") {
    return <g className="wally__eyes" stroke={line} strokeWidth={mini ? 7 : 5} strokeLinecap="round" fill="none"><path d="M38 79 Q46 69 54 79" /><path d="M64 79 Q72 69 80 79" /></g>;
  }
  if (state === "offline") {
    return <g className="wally__eyes" stroke={line} strokeWidth={mini ? 7 : 5} strokeLinecap="round" fill="none"><path d="M38 76 Q46 84 54 76" /><path d="M64 76 Q72 84 80 76" /></g>;
  }
  const r = mini ? 9 : 8;
  return (
    <g className="wally__eyes">
      {inverse ? null : <><ellipse cx="46" cy="77" rx={mini ? 9 : 7.5} ry={r} fill={f.face} /><ellipse cx="72" cy="77" rx={mini ? 9 : 7.5} ry={r} fill={f.face} /></>}
      <g className="wally__pupils" fill={f.pupil}>
        <circle cx="47.5" cy="78.5" r={inverse ? (mini ? 7 : 6) : mini ? 5 : 3.8} />
        <circle cx="73.5" cy="78.5" r={inverse ? (mini ? 7 : 6) : mini ? 5 : 3.8} />
        {mini ? null : <><circle cx={inverse ? 49.8 : 48.9} cy={inverse ? 76 : 77} r={inverse ? 1.8 : 1.3} fill={inverse ? f.body : f.face} /><circle cx={inverse ? 75.8 : 74.9} cy={inverse ? 76 : 77} r={inverse ? 1.8 : 1.3} fill={inverse ? f.body : f.face} /></>}
      </g>
    </g>
  );
}

function Mouth({ state, f, mini, inverse }: { readonly state: WallyState; readonly f: WallyFills; readonly mini: boolean; readonly inverse: boolean }): ReactElement {
  const line = inverse ? f.pupil : f.face;
  const width = mini ? 6.5 : 4.5;
  if (state === "approved") return <path className="wally__mouth" d="M47 88 H71 Q71 101 59 101 Q47 101 47 88 Z" fill={line} />;
  if (state === "stopped") return <path className="wally__mouth" d="M51 93 H67" stroke={line} strokeWidth={width} strokeLinecap="round" />;
  if (state === "offline") return <ellipse className="wally__mouth" cx="59" cy="94" rx="4" ry="3" fill={line} />;
  return <path className="wally__mouth" d="M50 90 Q59 98 68 90" stroke={line} strokeWidth={width} strokeLinecap="round" fill="none" />;
}

function Extras({ state, f, mini }: { readonly state: WallyState; readonly f: WallyFills; readonly mini: boolean }): ReactElement | null {
  if (state === "approved") {
    return (
      <g className="wally__sparks" fill={f.spark}>
        <path className="wally__spark" d="M103 10 L106 19 L115 22 L106 25 L103 34 L100 25 L91 22 L100 19 Z" />
        {mini ? null : <path className="wally__spark wally__spark--2" d="M17 18 L19 23.5 L24.5 25.5 L19 27.5 L17 33 L15 27.5 L9.5 25.5 L15 23.5 Z" />}
      </g>
    );
  }
  if (state === "stopped") {
    return (
      <g className="wally__shield">
        <path d="M96 76 L112 82 V93 C112 103 105 110 96 113 C87 110 80 103 80 93 V82 Z" fill={f.stop} stroke={f.onStop} strokeWidth="3" strokeLinejoin="round" />
        <rect x="88" y="91.5" width="16" height="5" rx="2.5" fill={f.onStop} />
      </g>
    );
  }
  if (state === "offline" && !mini) {
    return (
      <g className="wally__zz" fill={f.muted} fontFamily="ui-rounded, system-ui, sans-serif" fontWeight="800">
        <text className="wally__z" x="98" y="34" fontSize="16">z</text>
        <text className="wally__z wally__z--2" x="108" y="20" fontSize="11">z</text>
      </g>
    );
  }
  return null;
}

function Brows({ state, f, inverse }: { readonly state: WallyState; readonly f: WallyFills; readonly inverse: boolean }): ReactElement | null {
  if (state !== "stopped") return null;
  return <g stroke={inverse ? f.pupil : f.face} strokeWidth="4" strokeLinecap="round"><path d="M39 66.5 L52 64" /><path d="M79 66.5 L66 64" /></g>;
}

export function WallyArt({ state = "idle", detail = "full", variant = "default", fills = VAR_FILLS, size = 96, shadow = true }: WallyArtProps): ReactElement {
  const mini = detail === "mini";
  const inverse = variant === "inverse";
  const f = fills;
  return (
    <svg className="wally__svg" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      {shadow && !mini ? <ellipse className="wally__ground" cx="60" cy="110" rx="32" ry="4.5" fill={f.shadow} /> : null}
      <g className="wally__body">
        <g transform="rotate(-10 58 33)">
          <rect x="30" y="12" width="58" height="40" rx="7" fill={f.card} />
          {mini ? null : <rect x="30" y="21" width="58" height="7" fill={f.stripe} />}
        </g>
        <rect x="12" y="34" width="96" height="72" rx="24" fill={f.body} />
        <path d="M12 60 V58 A24 24 0 0 1 36 34 H84 A24 24 0 0 1 108 58 V60 Z" fill={f.flap} />
        <rect x="82" y="46" width="26" height="22" rx="11" fill={f.flap} />
        <circle cx="95" cy="57" r={mini ? 6 : 4.5} fill={f.card} />
        <Brows state={state} f={f} inverse={inverse} />
        <Eyes state={state} f={f} mini={mini} inverse={inverse} />
        <Mouth state={state} f={f} mini={mini} inverse={inverse} />
      </g>
      <Extras state={state} f={f} mini={mini} />
    </svg>
  );
}
