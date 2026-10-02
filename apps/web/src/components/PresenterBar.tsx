// PresenterBar (docs/06): where the script is (DM1 to DM9), Step, Skip for the optional DM6, Reset, the SIMULATED/REAL
// switch (REAL stays disabled until a captured real decline exists) and, on the presenter only, EN | 繁 | Both.
// Step uses the native disabled attribute while a call is in flight, so nothing is double-sent.
import type { ReactElement } from "react";
import type { RealCapture } from "../api/types";
import type { PresenterStep } from "../booth/presenterScript";
import { Tx } from "../evidence/components/Tx";
import { UI } from "../i18n/ui";
import { cx } from "../ui/cx";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";
import { Segmented } from "../ui/Nav";

export type Mode = "SIMULATED" | "REAL";
export type PresenterLang = "en" | "zh-HK" | "both";

const PU = UI.presenterUi;

export interface PresenterBarProps {
  /** Index of the next step to run; equals steps.length at the end of the script. */
  readonly index: number;
  readonly steps: readonly PresenterStep[];
  readonly mode: Mode;
  readonly realCapture: RealCapture | null;
  readonly busy: boolean;
  readonly onStep: () => void;
  readonly onSkip: () => void;
  readonly onReset: () => void;
  readonly onMode: (mode: Mode) => void;
  /** Presenter language: one language, or both side by side. Omit to hide the switch. */
  readonly lang?: PresenterLang;
  readonly onLang?: (lang: PresenterLang) => void;
}

function Progress({ index, steps }: { readonly index: number; readonly steps: readonly PresenterStep[] }): ReactElement {
  return (
    <ol className="pr-bar__dots" aria-hidden="true">
      {steps.map((s, i) => <li key={i} className={cx("pr-bar__dot", i < index && "pr-bar__dot--done", i === index && "pr-bar__dot--next", s.optional && "pr-bar__dot--optional")} />)}
    </ol>
  );
}

export function PresenterBar({ index, steps, mode, realCapture, busy, onStep, onSkip, onReset, onMode, lang, onLang }: PresenterBarProps): ReactElement {
  const { t } = useLocale();
  const next = steps[index];
  const last = index >= steps.length;
  return (
    <nav className="pr-bar" aria-label={t(PU.controls)}>
      <div className="pr-bar__where">
        <span className="pr-bar__moment" data-ident>{last ? "END" : (next?.moment ?? "")}</span>
        <span className="pr-bar__title">{last ? <Tx text={PU.end} /> : next ? <Tx text={next.title} /> : null}</span>
        <Progress index={index} steps={steps} />
      </div>
      <div className="pr-bar__actions">
        <button type="button" className="w-btn w-btn--primary w-btn--lg pr-bar__step" onClick={onStep} disabled={busy || last}>
          <span className="w-btn__label"><Tx text={PU.step} /></span>
          <span className="w-btn__icon"><Icon name="chevronRight" size={24} /></span>
        </button>
        {next?.optional ? (
          <button type="button" className="w-btn w-btn--secondary w-btn--md" onClick={onSkip} disabled={busy}><span className="w-btn__label">{t(PU.skip)}</span></button>
        ) : null}
        <button type="button" className="w-btn w-btn--ghost w-btn--md" onClick={onReset} disabled={busy}>
          <span className="w-btn__icon"><Icon name="refresh" size={20} /></span>
          <span className="w-btn__label"><Tx text={PU.reset} /></span>
        </button>
      </div>
      <div className="pr-bar__switches">
        <div role="radiogroup" aria-label={t(PU.mode)} className="pr-mode">
          <button type="button" role="radio" aria-checked={mode === "SIMULATED"} className="pr-mode__opt" onClick={() => onMode("SIMULATED")}>{t(PU.simulated)}</button>
          <button type="button" role="radio" aria-checked={mode === "REAL"} className="pr-mode__opt" disabled={realCapture === null} onClick={() => onMode("REAL")}>
            {t(PU.real)}
            {realCapture === null ? <span className="pr-mode__off"> {t(PU.realOff)}</span> : null}
          </button>
        </div>
        {lang !== undefined && onLang ? (
          <Segmented<PresenterLang>
            label={t(PU.language)}
            value={lang}
            onChange={onLang}
            options={[{ value: "en", label: "EN", ariaLabel: "English" }, { value: "zh-HK", label: "繁", lang: "zh-HK", ariaLabel: "繁體中文" }, { value: "both", label: t(PU.both) }]}
          />
        ) : null}
      </div>
    </nav>
  );
}
