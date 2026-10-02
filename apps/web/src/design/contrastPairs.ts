// Every foreground/background token pair the UI is allowed to draw, with its WCAG floor. The token test checks each
// pair in light and dark; the style guide prints the same table. Add a pair here before using a new combination.

export interface ContrastPair {
  readonly fg: string;
  readonly bg: string;
  /** 4.5 for text, 3 for large text, icons, borders and focus rings. */
  readonly min: 4.5 | 3;
}

const TEXT = 4.5;
const UI = 3;
const SURFACES = ["c-bg", "c-surface", "c-surface-raised"] as const;
const ROLES = ["primary", "accent", "ok", "warn", "stop", "info"] as const;
/** Fills that may stand alone as UI (a bar, a dot, a ring). Accent and warn fills always carry their on-colour text. */
const STANDALONE_FILLS = ["primary", "ok", "stop", "info"] as const;

function onSurfaces(fg: string, min: 4.5 | 3, extra: readonly string[] = []): ContrastPair[] {
  return [...SURFACES, ...extra].map((bg) => ({ fg, bg, min }));
}

function rolePairs(role: (typeof ROLES)[number]): ContrastPair[] {
  return [
    { fg: `c-on-${role}`, bg: `c-${role}`, min: TEXT },
    ...onSurfaces(`c-${role}-ink`, TEXT, [`c-${role}-tint`]),
  ];
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...onSurfaces("c-ink", TEXT, ["c-surface-sunken"]),
  ...onSurfaces("c-ink-muted", TEXT, ["c-surface-sunken"]),
  ...ROLES.flatMap(rolePairs),
  { fg: "c-on-primary", bg: "c-primary-pressed", min: TEXT },
  { fg: "c-on-stop", bg: "c-stop-ink", min: TEXT },
  { fg: "c-on-hero", bg: "c-hero-from", min: TEXT },
  { fg: "c-on-hero", bg: "c-hero-to", min: TEXT },
  { fg: "c-on-hero-muted", bg: "c-hero-from", min: TEXT },
  { fg: "c-on-hero-muted", bg: "c-hero-to", min: TEXT },
  { fg: "c-on-ticket", bg: "c-ticket", min: TEXT },
  { fg: "c-on-ticket-muted", bg: "c-ticket", min: TEXT },
  { fg: "c-accent", bg: "c-ticket", min: TEXT },
  { fg: "sim", bg: "sim-bg", min: TEXT },
  { fg: "obs", bg: "obs-bg", min: TEXT },
  { fg: "meas", bg: "meas-bg", min: TEXT },
  { fg: "asm", bg: "asm-bg", min: TEXT },
  ...onSurfaces("c-line-strong", UI, ["c-surface-sunken"]),
  ...onSurfaces("c-focus", UI, ["c-surface-sunken"]),
  ...STANDALONE_FILLS.flatMap((r) => onSurfaces(`c-${r}`, UI)),
  { fg: "c-primary", bg: "c-surface-sunken", min: UI },
  { fg: "sim-line", bg: "sim-bg", min: UI },
  ...onSurfaces("wally-body", UI),
];
