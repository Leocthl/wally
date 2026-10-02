// Pure helpers over tokens.css: parse every light-dark() token and build the plain-colour fallback sheet.
// Used by scripts/gen-token-fallback.ts (writes tokens-fallback.css) and by the design tests (which check it is in sync).

export type Mode = "light" | "dark";

export interface ThemedToken {
  readonly name: string;
  readonly light: string;
  readonly dark: string;
}

const DECL = /--([a-z0-9-]+):\s*light-dark\(/g;

/** Splits "a, b" at the top-level comma, ignoring commas inside rgb(...) and similar. */
function splitTopLevel(args: string): readonly [string, string] | null {
  let depth = 0;
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) return [args.slice(0, i).trim(), args.slice(i + 1).trim()];
  }
  return null;
}

/** Reads the balanced argument list that starts right after "light-dark(". */
function readArgs(css: string, start: number): string | null {
  let depth = 1;
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === "(") depth += 1;
    else if (css[i] === ")") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i);
    }
  }
  return null;
}

/** Every `--name: light-dark(<light>, <dark>)` in source order. The last declaration of a name wins, as in CSS. */
export function parseThemedTokens(css: string): readonly ThemedToken[] {
  const byName = new Map<string, ThemedToken>();
  for (const m of css.matchAll(DECL)) {
    const name = m[1];
    if (!name || m.index === undefined) continue;
    const args = readArgs(css, m.index + m[0].length);
    const pair = args === null ? null : splitTopLevel(args);
    if (pair) byName.set(name, { name, light: pair[0], dark: pair[1] });
  }
  return [...byName.values()];
}

function block(tokens: readonly ThemedToken[], mode: Mode, indent: string): string {
  return tokens.map((t) => `${indent}--${t.name}: ${t[mode]};`).join("\n");
}

interface Scope {
  readonly light: string;
  readonly darkMedia: string;
  readonly darkForced: string;
}

const ROOT_SCOPE: Scope = {
  light: ":root, .theme-light",
  darkMedia: ':root:not([data-theme="light"])',
  darkForced: ':root[data-theme="dark"], .theme-dark',
};

const WARM = '[data-palette="warm"]';
const WARM_SCOPE: Scope = {
  light: WARM,
  darkMedia: `:root:not([data-theme="light"])${WARM}, :root:not([data-theme="light"]) ${WARM}`,
  darkForced: `:root[data-theme="dark"]${WARM}, :root[data-theme="dark"] ${WARM}, .theme-dark${WARM}, .theme-dark ${WARM}`,
};

function scopeBlocks(tokens: readonly ThemedToken[], scope: Scope): string[] {
  if (tokens.length === 0) return [];
  return [
    `  ${scope.light} {`,
    block(tokens, "light", "    "),
    "  }",
    "  @media (prefers-color-scheme: dark) {",
    `    ${scope.darkMedia} {`,
    block(tokens, "dark", "      "),
    "    }",
    "  }",
    `  ${scope.darkForced} {`,
    block(tokens, "dark", "    "),
    "  }",
  ];
}

/** The fallback sheet: light by default, dark under prefers-color-scheme (unless forced light) and data-theme="dark".
 *  The optional warm palette follows with higher-specificity selectors, so it wins wherever data-palette="warm" is set. */
export function buildFallbackCss(css: string, warmCss = ""): string {
  return [
    "/* tokens-fallback.css: GENERATED from tokens.css and tokens-warm.css by scripts/gen-token-fallback.ts. Do not edit.",
    "   light-dark() needs Chrome 123, Safari 17.5 or Firefox 120; older browsers get these plain values instead. */",
    "@supports not (color: light-dark(#000000, #ffffff)) {",
    ...scopeBlocks(parseThemedTokens(css), ROOT_SCOPE),
    ...scopeBlocks(parseThemedTokens(warmCss), WARM_SCOPE),
    "}",
    "",
  ].join("\n");
}

/** Cool tokens with the warm overrides on top: what a data-palette="warm" subtree resolves to. */
export function overlayTokens(base: readonly ThemedToken[], over: readonly ThemedToken[]): ReadonlyMap<string, ThemedToken> {
  return new Map([...base, ...over].map((t) => [t.name, t] as const));
}
