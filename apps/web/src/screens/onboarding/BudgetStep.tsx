// Step three, Your first budget. A booth that already holds a budget (the live booth pre-seals HK$800) skips the form and
// says "Your budget is ready". With none, the person picks an amount, how long and what Wally can buy, then goes through
// the Seal screen's own Check and seal moment (ReviewStep, the lock, the haptic): this file never signs anything itself.
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
import { formFromRules, isValid, toSealRequest, validate } from "../seal/sealModel";
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

export function BudgetStep({ draft, onDraft, onBack, onDone, onRetry, dir, skip }: BudgetStepProps): ReactElement {
  const booth = useBoothContext();
  const { t, locale } = useLocale();
  const now = useMemo(() => new Date(), []);
  const ceremony = useSealCeremony();
  const form = formOf(draft, now);
  const family = useFamilySeal(form.amount);
  const [view, setView] = useState<View>("pick");
  const [showErrors, setShowErrors] = useState(false);
  const errors = validate(form, now);
  const until = untilOf(draft, now);
  const { mandate, packet } = booth.state;
  const held = mandate !== null && packet !== null && (packet.status === "ACTIVE" || packet.status === "EXHAUSTED");
  const mine = ceremony.sealing || ceremony.sealedForm !== null;
  const skipping: SkipControl = { onSkip: skip.onSkip, busy: skip.busy || ceremony.sealing };

  const review = (): void => {
    setShowErrors(true);
    if (!isValid(errors) || family.over) {
      document.querySelector<HTMLElement>("[data-field] input, [data-field] button, [data-field]")?.focus();
      return;
    }
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
        <ReviewStep form={ceremony.sealedForm ?? form} sealing={ceremony.sealing} sealed={ceremony.sealedForm !== null} replacing={false} onEdit={() => setView("pick")} onSeal={() => void seal()} />
      </StepFrame>
    );
  }

  // A budget is already there (the live booth seals one when it starts): nothing to ask.
  if (held && mandate !== null) {
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
      <StepFrame key="loading" step="budget" wally="idle" title={t(OB.budget.title)} dir={dir} skip={skipping} actions={null}>
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
      <StepFrame key="review" step="budget" wally="idle" title={t(UI["seal.reviewTitle"])} dir="fwd" skip={skipping} actions={null}>
        <ReviewStep form={form} sealing={false} replacing={false} onEdit={() => setView("pick")} onSeal={() => void seal()} />
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
          {/* Skip seals the ready-made budget only when there is none; a budget that is over stays as it is. */}
          {mandate === null ? <p className="onb-skipnote">{t(OB.budget.skipNote)}</p> : null}
        </>
      }
    >
      <BudgetPicker draft={draft} onDraft={onDraft} errors={errors} showErrors={showErrors} until={until.day} capped={until.capped} now={now} family={family} />
    </StepFrame>
  );
}

