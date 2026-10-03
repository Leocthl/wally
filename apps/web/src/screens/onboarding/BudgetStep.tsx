// Step three, Your first budget. A booth that already holds a live budget (the live booth pre-seals HK$800) skips the form and
// says "Your budget is ready". With none, or one that is over (cancelled, ended, all used), the person picks an amount, how
// long and what Wally can buy, then goes through the Seal screen's own Check and seal moment (ReviewStep, the lock, the
// haptic): this file never signs anything itself. Sealing over a budget that is over says so, as the Seal screen does.
import { useMemo, useState, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import type { Profile } from "../../state/profile";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Skeleton } from "../../ui/Surface";
import { CantReach } from "../../shell/Connection";
import { RulesSummary, ReviewStep } from "../seal/SealSteps";
import { SealLock } from "../seal/SealLock";
import { formFromRules, isValid, toSealRequest, validate, type FormErrors } from "../seal/sealModel";
import { useFamilySeal } from "../seal/FamilyChoice";
import { useSealCeremony } from "../seal/useSealCeremony";
import "../seal/seal.css";
import { BudgetPicker } from "./BudgetPicker";
import { formOf, sentenceFor, untilOf, type BudgetDraft } from "./budgetModel";
import { StepFrame, type SkipControl } from "./StepFrame";

export interface BudgetStepProps {
  /** The taste so far: what the person shops for sets the categories and the amount to start from. */
  readonly taste: Profile;
  readonly draft: BudgetDraft;
  readonly onDraft: (next: BudgetDraft) => void;
  readonly onBack: () => void;
  /** The budget is set (already held, or just sealed): on to the quick tour. */
  readonly onDone: () => void;
  readonly onRetry: () => void;
  readonly dir: "fwd" | "back";
  readonly skip: SkipControl;
}

type View = "pick" | "review";

/** The fields in the order they are on the form. */
const FIELD_ORDER = ["amount", "until", "categories"] as const;

/** Moves focus to the first thing that needs fixing: the field itself, or the first choice of a group. */
function focusFirstProblem(errors: FormErrors): void {
  const name = FIELD_ORDER.find((field) => errors[field] !== undefined);
  const field = name === undefined ? document.querySelector<HTMLElement>("[data-field]") : document.querySelector<HTMLElement>(`[data-field="${name}"]`);
  const target = field?.matches("input, button, select, textarea") ? field : field?.querySelector<HTMLElement>("input, button");
  target?.focus();
}

export function BudgetStep({ draft, onDraft, onBack, onDone, onRetry, dir, skip }: BudgetStepProps): ReactElement {
  const booth = useBoothContext();
  const { t, locale } = useLocale();
  const now = useMemo(() => new Date(), []);
  const ceremony = useSealCeremony();
  const form = formOf(draft, now);
  // A first budget starts on the person's own money, even when the budget now held is Mum's and over.
  const family = useFamilySeal(form.amount, { startOwn: true });
  const [view, setView] = useState<View>("pick");
  const [showErrors, setShowErrors] = useState(false);
  // Whether sealing replaces a budget, as it was when the person went to Check and seal: the seal itself makes a budget appear,
  // and the note must not show up in the middle of sealing the first one.
  const [replacing, setReplacing] = useState(false);
  const errors = validate(form, now);
  const until = untilOf(draft, now);
  const { mandate, packet } = booth.state;
  // Ready means a budget Wally can shop in now. One that is cancelled, ended or all used is not that: the form is offered.
  const live = mandate !== null && packet !== null && packet.status === "ACTIVE" && !booth.state.revoked;
  const mine = ceremony.sealing || ceremony.sealedForm !== null;
  const skipping: SkipControl = { onSkip: skip.onSkip, busy: skip.busy || ceremony.sealing };
  // Skip uses the ready-made budget when there is none; with one held it seals nothing. Said wherever Skip could be mistaken for "use mine".
  const skipNote = mandate === null ? <p className="onb-skipnote">{t(OB.budget.skipNote)}</p> : null;

  const review = (): void => {
    setShowErrors(true);
    if (!isValid(errors) || family.over) {
      focusFirstProblem(errors);
      return;
    }
    setReplacing(mandate !== null);
    setView("review");
  };
  const seal = async (): Promise<void> => {
    if (!isValid(validate(form, new Date())) || family.over) {
      setView("pick");
      return;
    }
    await ceremony.seal((at) => family.apply(toSealRequest(sentenceFor(form, locale, now), form, at)), form);
  };

  const continueButton = (
    <Button size="lg" block iconEnd={<Icon name="chevronRight" size={20} />} onClick={onDone} data-next>{t(OB.continue)}</Button>
  );
  const backButton = (
    <Button variant="secondary" size="lg" icon={<Icon name="chevronLeft" size={20} />} onClick={onBack} data-back>{t(OB.back)}</Button>
  );

  // The Check and seal moment, and then the sealed screen.
  if (mine) {
    if (ceremony.settled && ceremony.sealedForm !== null) {
      return (
        <StepFrame key="sealed" step="budget" wally="approved" title={t(UI["seal.sealedTitle"])} dir="fwd" skip={skipping} actions={continueButton}>
          <div className="onb-body onb-sealed" role="status">
            <SealLock locked settled size={96} />
            <p className="onb-lead">{t(OB.budget.sealedBody)}</p>
            <RulesSummary form={ceremony.sealedForm} signed />
          </div>
        </StepFrame>
      );
    }
    return (
      <StepFrame key="review" step="budget" wally="idle" title={t(UI["seal.reviewTitle"])} dir="fwd" skip={skipping} actions={null}>
        <ReviewStep form={ceremony.sealedForm ?? form} sealing={ceremony.sealing} sealed={ceremony.sealedForm !== null} replacing={replacing} onEdit={() => setView("pick")} onSeal={() => void seal()} />
      </StepFrame>
    );
  }

  // A budget is already there (the live booth seals one when it starts): nothing to ask.
  if (live && mandate !== null) {
    return (
      <StepFrame key="ready" step="budget" wally="approved" title={t(OB.budget.readyTitle)} dir={dir} skip={skipping} actions={<div className="onb-actions__row">{backButton}<span className="onb-actions__grow">{continueButton}</span></div>}>
        <div className="onb-body" data-ready>
          <p className="onb-lead">{t(OB.budget.readyBody)}</p>
          <RulesSummary form={formFromRules(mandate.rules, mandate.valid_until)} signed />
        </div>
      </StepFrame>
    );
  }

  if (booth.info === null) {
    return (
      <StepFrame key="loading" step="budget" wally="idle" title={t(OB.budget.title)} dir={dir} skip={skipping} actions={<div className="onb-actions__row">{backButton}</div>}>
        {booth.error !== null ? (
          <CantReach onRetry={onRetry} />
        ) : (
          <div className="onb-body" role="status">
            <span className="sr-only">{t(OB.budget.loading)}</span>
            <Skeleton width="100%" height="3.5rem" radius="md" />
            <Skeleton lines={3} />
          </div>
        )}
      </StepFrame>
    );
  }

  if (view === "review") {
    return (
      <StepFrame key="review" step="budget" wally="idle" title={t(UI["seal.reviewTitle"])} dir="fwd" skip={skipping} actions={skipNote}>
        <ReviewStep form={form} sealing={false} replacing={replacing} onEdit={() => setView("pick")} onSeal={() => void seal()} />
      </StepFrame>
    );
  }

  return (
    <StepFrame
      key="pick"
      step="budget"
      wally="idle"
      title={t(OB.budget.title)}
      dir={dir}
      skip={skipping}
      actions={
        <>
          <div className="onb-actions__row">
            {backButton}
            <Button size="lg" className="onb-actions__grow" iconEnd={<Icon name="chevronRight" size={20} />} onClick={review} data-next>{t(OB.budget.review)}</Button>
          </div>
          {skipNote}
        </>
      }
    >
      <BudgetPicker draft={draft} onDraft={onDraft} errors={errors} showErrors={showErrors} until={until.day} capped={until.capped} now={now} family={family} onSubmit={review} />
    </StepFrame>
  );
}

