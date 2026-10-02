// Style guide reference sections: Wally's states and sizes, the palette with contrast ratios from the token source,
// and the type scale. The ratios come from the same pair table the token test checks.
import type { ReactElement } from "react";
import tokensCss from "../../design/tokens.css?raw";
import warmCss from "../../design/tokens-warm.css?raw";
import { contrastRatio, wcagLevel } from "../../design/contrast";
import { CONTRAST_PAIRS } from "../../design/contrastPairs";
import { overlayTokens, parseThemedTokens, type Mode } from "../../design/tokenTools";
import { useLocale } from "../../ui/locale";
import { Wally, WALLY_STATES } from "../../wally/Wally";
import { Wordmark } from "../../wally/Wordmark";

const SWATCHES = ["c-bg", "c-surface", "c-surface-sunken", "c-ink", "c-ink-muted", "c-line", "c-line-strong", "c-primary", "c-primary-tint", "c-accent", "c-accent-tint", "c-ok", "c-ok-tint", "c-warn", "c-warn-tint", "c-stop", "c-stop-tint", "c-info", "c-info-tint", "c-hero-from", "c-hero-to", "c-ticket"] as const;
const KEY_PAIRS = CONTRAST_PAIRS.filter((p) => ["c-ink", "c-ink-muted", "c-on-primary", "c-primary-ink", "c-ok-ink", "c-warn-ink", "c-stop-ink", "c-on-hero", "c-on-hero-muted", "c-line-strong", "sim"].includes(p.fg)).filter((p, i, all) => all.findIndex((q) => q.fg === p.fg) === i);

export function WallySection(): ReactElement {
  return (
    <div className="sg-stack">
      <div className="sg-wally-grid">
        {WALLY_STATES.map((s) => (
          <figure key={s} className="sg-wally-cell">
            <Wally state={s} size={96} />
            <figcaption>{s}</figcaption>
          </figure>
        ))}
      </div>
      <div className="sg-wally-sizes" aria-label="Sizes">
        {[24, 32, 48, 64, 160].map((n) => <Wally key={n} state="idle" size={n} decorative />)}
      </div>
      <div className="sg-wordmarks">
        <Wordmark size="lg" />
        <Wordmark size="md" />
      </div>
    </div>
  );
}

function Swatch({ name, light, dark }: { readonly name: string; readonly light: string; readonly dark: string }): ReactElement {
  return (
    <li className="sg-swatch">
      <span className="sg-swatch__chip" style={{ background: `var(--${name})` }} aria-hidden="true" />
      <span className="sg-swatch__name mono">--{name}</span>
      <span className="sg-swatch__hex mono">{light} / {dark}</span>
    </li>
  );
}

export function PaletteSection({ warm }: { readonly warm: boolean }): ReactElement {
  const base = parseThemedTokens(tokensCss);
  const map = overlayTokens(base, warm ? parseThemedTokens(warmCss) : []);
  const ratio = (fg: string, bg: string, mode: Mode): number => {
    const f = map.get(fg)?.[mode];
    const b = map.get(bg)?.[mode];
    return f && b ? contrastRatio(f, b) : 0;
  };
  return (
    <div className="sg-stack">
      <ul className="sg-swatches">
        {SWATCHES.map((n) => {
          const t = map.get(n);
          return t ? <Swatch key={n} name={n} light={t.light} dark={t.dark} /> : null;
        })}
      </ul>
      <div className="sg-table-wrap">
        <table className="sg-table">
          <caption>{CONTRAST_PAIRS.length} pairs tested in light and dark; a sample:</caption>
          <thead><tr><th scope="col">Text or UI</th><th scope="col">On</th><th scope="col">Light</th><th scope="col">Dark</th></tr></thead>
          <tbody>
            {KEY_PAIRS.map((p) => {
              const [l, d] = [ratio(p.fg, p.bg, "light"), ratio(p.fg, p.bg, "dark")];
              return (
                <tr key={`${p.fg}-${p.bg}`}>
                  <td className="mono">{p.fg}</td>
                  <td className="mono">{p.bg}</td>
                  <td><span className="sg-ratio" style={{ color: `var(--${p.fg})`, background: `var(--${p.bg})` }}>Aa</span> {l.toFixed(1)} {wcagLevel(l)}</td>
                  <td>{d.toFixed(1)} {wcagLevel(d)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TYPE = [
  { token: "--text-5xl", use: "Hero amount", sample: "HK$541", display: true },
  { token: "--text-4xl", use: "Result amount", sample: "HK$259", display: true },
  { token: "--text-2xl", use: "Screen title", sample: "Stopped before paying", display: false },
  { token: "--text-xl", use: "Sheet title", sample: "Why Wally stopped", display: false },
  { token: "--text-lg", use: "Row title", sample: "Denim jacket", display: false },
  { token: "--text-md", use: "Body, inputs (16 px)", sample: "Works once, for this amount only", display: false },
  { token: "--text-sm", use: "Secondary", sample: "Verified on this phone", display: false },
  { token: "--text-xs", use: "Tags, tab labels", sample: "SIMULATED", display: false },
] as const;

export function TypeSection(): ReactElement {
  const { locale } = useLocale();
  return (
    <ul className="sg-type">
      {TYPE.map((row) => (
        <li key={row.token} className="sg-type__row">
          <span className="sg-type__meta mono">{row.token} · {row.use}</span>
          <span className={row.display ? "sg-type__sample sg-type__sample--display" : "sg-type__sample"} style={{ fontSize: `var(${row.token})` }}>{row.sample}</span>
        </li>
      ))}
      <li className="sg-type__row" lang="zh-HK">
        <span className="sg-type__meta mono">--font-zh · {locale === "zh-HK" ? "active" : "fallback"}</span>
        <span className="sg-type__sample" style={{ fontSize: "var(--text-xl)" }}>付款前已攔截 · 預算剩餘 HK$541</span>
      </li>
    </ul>
  );
}
