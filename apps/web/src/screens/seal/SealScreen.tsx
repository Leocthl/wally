// Seal (#/seal): first run in three calm steps (Meet Wally, Describe your budget, Check and seal), or Top up and Change
// the rules (#/seal?mode=topup|edit) starting at step two, prefilled from the signed rules. #/seal?mode=welcome shows
// the first-run steps even when a budget exists (the booth crew can walk a judge through onboarding). Sealing always makes a new
// signed budget through api.seal (SealRequest unchanged); nothing seals by itself.
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { Mandate } from "../../api/types";
import { useBoothContext } from "../../hooks/useBooth";
import { navigate, PARAM, useRouteParam } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { IconButton } from "../../ui/Button";
import { haptic } from "../../ui/haptics";
import { Icon } from "../../ui/icons";
import { useLocale, type Locale } from "../../ui/locale";
import { attempt } from "../../shell/actions";
import { DescribeStep } from "./DescribeStep";
import { EXAMPLES } from "./examples";
import { useFamilySeal } from "./FamilyChoice";
import { SealLock } from "./SealLock";
import { DoneStep, MeetStep, ReviewStep } from "./SealSteps";
import { applySentence, EMPTY_FORM, formFromRules, hkDay, isValid, monthEndDay, toSealRequest, validate, type FieldName, type RulesForm, type SuggestRules } from "./sealModel";
import "./seal.css";

type Step = "meet" | "describe" | "review" | "done";
const FIELD_ORDER: readonly FieldName[] = ["amount", "categories", "until", "askAbove", "cap", "share"];
const ALL_FIELDS: ReadonlySet<FieldName> = new Set(FIELD_ORDER);

interface Start {
  readonly step: Step;
  readonly sentence: string;
  readonly form: RulesForm;
}

function startFrom(mandate: Mandate | null, locale: Locale, now: Date, welcome: boolean): Start {
  if (mandate && !welcome) {
    const form = formFromRules(mandate.rules, mandate.valid_until);
    const stale = form.until < hkDay(now.toISOString());
    return { step: "describe", sentence: mandate.intent_text, form: stale ? { ...form, until: monthEndDay(now) } : form };
  }
  const example = EXAMPLES[0];
  const sentence = example ? (locale === "zh-HK" ? example.sentence.zh : example.sentence.en) : "";
  return { step: "meet", sentence, form: example ? applySentence(EMPTY_FORM(now), example.sentence.en, now).form : EMPTY_FORM(now) };
}

function focusField(field: FieldName): void {
  document.querySelector<HTMLElement>(`[data-field="${field}"] input, [data-field="${field}"] button`)?.focus();
}

function Header({ title, onBack, step }: { readonly title: string; readonly onBack: () => void; readonly step: Step }): ReactElement {
  const { t } = useLocale();
  const at = step === "describe" ? 1 : 2;
  return (
    <div className="seal-head">
      <IconButton label={t(UI.back)} icon={<Icon name="chevronLeft" />} onClick={onBack} />
      <h1 id="seal-describe-title" className="seal-head__title" tabIndex={-1}>{title}</h1>
      <span className="seal-dots" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="seal-dots__dot" data-on={i <= at} />)}
      </span>
    </div>
  );
}

/** The booth's own reader (api.compileRules) unless <App> was given another; none when the client cannot read a sentence. */
function useSuggester(given: SuggestRules | undefined): SuggestRules | undefined {
  const { api } = useBoothContext();
  const compile = api.compileRules;
  return useMemo<SuggestRules | undefined>(() => {
    if (given) return given;
    if (typeof compile !== "function") return undefined;
    return (text, locale) => compile.call(api, { text, locale });
  }, [given, api, compile]);
}

function SealFlow({ suggestRules: given }: { readonly suggestRules?: SuggestRules }): ReactElement {
  const booth = useBoothContext();
  const suggestRules = useSuggester(given);
  const { t, locale } = useLocale();
  const mode = useRouteParam(PARAM.mode);
  const now = useMemo(() => new Date(), []);
  const start = useMemo(() => startFrom(booth.state.mandate, locale, now, mode === "welcome"), []);
  const [step, setStep] = useState<Step>(start.step);
  const [sentence, setSentence] = useState(start.sentence);
  const [form, setForm] = useState<RulesForm>(start.form);
  const [incomplete, setIncomplete] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [sealedForm, setSealedForm] = useState<RulesForm | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const errors = validate(form, new Date());
  const replacing = booth.state.mandate !== null;
  const family = useFamilySeal(form.amount);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const heading = top.current?.querySelector<HTMLElement>("h1");
    heading?.setAttribute("tabindex", "-1");
    if (step !== start.step || mode !== "topup") heading?.focus({ preventScroll: true });
    else focusField("amount");
  }, [step]);

  const next = (): void => {
    setSubmitted(true);
    if (!isValid(errors) || family.over) {
      const first = FIELD_ORDER.find((f) => errors[f] !== undefined || family.notes[f] !== undefined);
      if (first) focusField(first);
      return;
    }
    setStep("review");
  };

  const seal = async (): Promise<void> => {
    const at = new Date();
    if (!isValid(validate(form, at)) || family.over) {
      setStep("describe");
      return;
    }
    setSealing(true);
    const ok = await attempt(booth, () => booth.api.seal(family.apply(toSealRequest(sentence, form, at))));
    setSealing(false);
    if (!ok) return;
    setSealedForm(form);
    setStep("done");
    haptic("success");
  };

  const title = mode === "topup" ? t(UI["seal.topUpTitle"]) : mode === "edit" ? t(UI["seal.editTitle"]) : t(UI["seal.describeTitle"]);

  return (
    <div className="seal-screen" ref={top} data-step={step}>
      {step === "meet" ? <MeetStep onStart={() => setStep("describe")} /> : null}
      {step === "describe" ? (
        <>
          <Header title={title} step={step} onBack={() => (start.step === "meet" ? setStep("meet") : navigate("budget"))} />
          <p className="seal-lead seal-screen__lead">{t(UI["seal.describeLead"])}</p>
          {family.choice}
          <DescribeStep
            sentence={sentence}
            form={form}
            errors={errors}
            shown={submitted ? ALL_FIELDS : touched}
            now={now}
            today={hkDay(now.toISOString())}
            incomplete={incomplete}
            notes={family.notes}
            {...(suggestRules ? { suggestRules } : {})}
            onSentence={(text, next, complete) => {
              setSentence(text);
              setForm(next);
              setIncomplete(text.trim().length > 0 && !complete);
            }}
            onForm={setForm}
            onTouch={(f) => setTouched((s) => new Set([...s, f]))}
            onNext={next}
          />
        </>
      ) : null}
      {step === "review" ? (
        <>
          <Header title={t(UI["seal.reviewTitle"])} step={step} onBack={() => setStep("describe")} />
          <ReviewStep form={form} sealing={sealing} replacing={replacing} onEdit={() => setStep("describe")} onSeal={() => void seal()} />
        </>
      ) : null}
      {step === "done" && sealedForm ? <DoneStep form={sealedForm} /> : null}
    </div>
  );
}

/** Waits for the first load: whether this is a first run or an edit depends on the budget already sealed. */
export function SealScreen({ suggestRules }: { readonly suggestRules?: SuggestRules }): ReactElement {
  const { info, busy, state } = useBoothContext();
  const { t } = useLocale();
  // Decided once: later busy moments (the seal itself) must not unmount the flow.
  const [ready, setReady] = useState(false);
  const loading = info === null || (state.mandate === null && busy);
  if (!loading && !ready) setReady(true);
  if (!ready && loading) {
    return (
      <div className="seal-screen seal-screen--loading" role="status">
        <SealLock locked={false} size={96} className="seal-review__lock" />
        <span className="sr-only">{t(UI.loading)}</span>
      </div>
    );
  }
  return <SealFlow {...(suggestRules ? { suggestRules } : {})} />;
}
