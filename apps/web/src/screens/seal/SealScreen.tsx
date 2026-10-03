// Seal (#/seal): first run in three calm steps (Meet Wally, Describe your budget, Check and seal), or Top up and Change
// the rules (#/seal?mode=topup|edit) starting at step two, prefilled from the signed rules. #/seal?mode=welcome shows
// the first-run steps even when a budget exists (the booth crew can walk a judge through onboarding). Sealing always makes a new
// signed budget through api.seal (SealRequest unchanged); nothing seals by itself.
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { Mandate } from "../../api/types";
import { useBoothContext } from "../../hooks/useBooth";
import { navigate, PARAM, useRouteParam } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { draftFor, formOf, sentenceFor } from "../onboarding/budgetModel";
import type { Profile } from "../../state/profile";
import { useProfile } from "../../state/useProfile";
import { IconButton } from "../../ui/Button";
import { Icon } from "../../ui/icons";
import { useLocale, type Locale } from "../../ui/locale";
import { DescribeStep } from "./DescribeStep";
import { EXAMPLES } from "./examples";
import { useFamilySeal } from "./FamilyChoice";
import { SealLock } from "./SealLock";
import { DoneStep, MeetStep, ReviewStep } from "./SealSteps";
import { useSealCeremony } from "./useSealCeremony";
import { applySentence, EMPTY_FORM, formFromRules, hkDay, isValid, monthEndDay, toSealRequest, validate, type FieldName, type RulesForm, type SuggestRules } from "./sealModel";
import "./seal.css";

type Step = "meet" | "describe" | "review" | "done";
const STEP_ORDER: readonly Step[] = ["meet", "describe", "review", "done"];
const FIELD_ORDER: readonly FieldName[] = ["amount", "categories", "until", "askAbove", "cap", "share"];
const ALL_FIELDS: ReadonlySet<FieldName> = new Set(FIELD_ORDER);

interface Start {
  readonly step: Step;
  readonly sentence: string;
  readonly form: RulesForm;
}

function startFrom(mandate: Mandate | null, locale: Locale, now: Date, welcome: boolean, profile: Profile | null): Start {
  if (mandate && !welcome) {
    const form = formFromRules(mandate.rules, mandate.valid_until);
    const stale = form.until < hkDay(now.toISOString());
    return { step: "describe", sentence: mandate.intent_text, form: stale ? { ...form, until: monthEndDay(now) } : form };
  }
  // A person who said what they shop for starts from that: its amount and its categories (taste is a starting point, they can change it).
  if (profile !== null && profile.shopFor.length > 0) {
    const form = formOf(draftFor(profile, now), now);
    return { step: "meet", sentence: sentenceFor(form, locale, now), form };
  }
  const example = EXAMPLES[0];
  const sentence = example ? (locale === "zh-HK" ? example.sentence.zh : example.sentence.en) : "";
  return { step: "meet", sentence, form: example ? applySentence(EMPTY_FORM(now), example.sentence.en, now).form : EMPTY_FORM(now) };
}

function focusField(field: FieldName): void {
  document.querySelector<HTMLElement>(`[data-field="${field}"] input, [data-field="${field}"] button`)?.focus();
}

function Header({ title, onBack, step, locked = false }: { readonly title: string; readonly onBack: () => void; readonly step: Step; readonly locked?: boolean }): ReactElement {
  const { t } = useLocale();
  const at = step === "describe" ? 1 : 2;
  return (
    <div className="seal-head">
      <IconButton label={t(UI.back)} icon={<Icon name="chevronLeft" />} onClick={onBack} disabled={locked} />
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
  const { profile } = useProfile();
  const mode = useRouteParam(PARAM.mode);
  const now = useMemo(() => new Date(), []);
  const start = useMemo(() => startFrom(booth.state.mandate, locale, now, mode === "welcome", profile), []);
  const [step, setStep] = useState<Step>(start.step);
  const [sentence, setSentence] = useState(start.sentence);
  const [form, setForm] = useState<RulesForm>(start.form);
  const [incomplete, setIncomplete] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<FieldName>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const { sealing, sealedForm, settled, seal: sealBudget } = useSealCeremony();
  const top = useRef<HTMLDivElement>(null);
  // Which way the person is moving, so the next pane arrives from that side (and a Back goes the other way). Set with the
  // step in one go: a pane's animation must not see its direction change after it has started.
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const go = (to: Step): void => {
    setDirection(STEP_ORDER.indexOf(to) >= STEP_ORDER.indexOf(step) ? "fwd" : "back");
    setStep(to);
  };
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

  // The seal moment plays on Check and seal (the lock closes where the person pressed), then the sealed screen takes over.
  // Under reduced motion --dur-ceremony is 0, so the next screen follows at once.
  useEffect(() => {
    if (!settled || step !== "review") return;
    setDirection("fwd");
    setStep("done");
  }, [settled, step]);

  const next = (): void => {
    setSubmitted(true);
    if (!isValid(errors) || family.over) {
      const first = FIELD_ORDER.find((f) => errors[f] !== undefined || family.notes[f] !== undefined);
      if (first) focusField(first);
      return;
    }
    go("review");
  };

  const seal = async (): Promise<void> => {
    const at = new Date();
    if (!isValid(validate(form, at)) || family.over) {
      go("describe");
      return;
    }
    await sealBudget((now) => family.apply(toSealRequest(sentence, form, now)), form);
  };

  const title = mode === "topup" ? t(UI["seal.topUpTitle"]) : mode === "edit" ? t(UI["seal.editTitle"]) : t(UI["seal.describeTitle"]);

  return (
    <div className="seal-screen" ref={top} data-step={step}>
      <div className="seal-pane" key={step} data-dir={direction} data-step={step}>
        {step === "meet" ? <MeetStep onStart={() => go("describe")} /> : null}
        {step === "describe" ? (
          <>
            <Header title={title} step={step} onBack={() => (start.step === "meet" ? go("meet") : navigate("budget"))} />
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
            <Header title={t(UI["seal.reviewTitle"])} step={step} onBack={() => go("describe")} locked={sealedForm !== null} />
            <ReviewStep form={sealedForm ?? form} sealing={sealing} sealed={sealedForm !== null} replacing={replacing} onEdit={() => go("describe")} onSeal={() => void seal()} />
          </>
        ) : null}
        {step === "done" && sealedForm ? <DoneStep form={sealedForm} /> : null}
      </div>
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
