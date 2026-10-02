// Stopped before paying: Wally with his shield, the plain reason from the engine's template and recorded inputs, a quiet
// rule chip (a name, never an id), what that means for money, and what to do next. role="alert" on the hero.
import type { ReactElement, Ref } from "react";
import type { Decision } from "../../../api/types";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { cartProv } from "../../../domain/provenance";
import { ProvenanceChip, Tag } from "../../../ui/Chip";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Card } from "../../../ui/Surface";
import { plainReason, ruleChip, templateOf } from "../model/reason";
import type { Answer, Result } from "../model/screen";
import { CardStory } from "./CardStory";
import { Footnote, Hero } from "./parts";

const R = UI.run;

/** Budget stops (R3, R4): a top-up can help. Anything else: ask for something different. */
export function isBudgetStop(decision: Decision): boolean {
  const rule = templateOf(decision)?.split(".")[0];
  return rule === "R3" || rule === "R4";
}

/** The lead sentence: how a question ended, when it did; else the rule's own plain reason. */
function leadFor(answer: Answer | undefined, decision: Decision): { readonly lead: LabelPair; readonly reason?: LabelPair } {
  if (answer === "no") return { lead: R.youSaidNo };
  if (answer === "expired") return { lead: R.nobodyAnswered };
  if (answer === "yesButRule") return { lead: R.hardRuleAnyway, reason: plainReason(decision) };
  return { lead: plainReason(decision) };
}

export interface StoppedProps {
  readonly result: Result;
  readonly fresh: boolean;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly onWhy: () => void;
  readonly onTopUp: () => void;
  readonly onAsk: () => void;
  /** Present only when the client offers alternatives (a later wave adds it). */
  readonly onCheaper?: () => void;
}

export function Stopped({ result, fresh, headingRef, onWhy, onTopUp, onAsk, onCheaper }: StoppedProps): ReactElement | null {
  const { t } = useLocale();
  const chain = result.chain;
  if (!chain) return null;
  const decision = chain.current;
  const { lead, reason } = leadFor(result.answer, decision);
  const chip = ruleChip(decision);
  const budget = isBudgetStop(decision);
  const cancelled = result.card !== undefined;
  return (
    <div className="run-stack" data-run-state="stopped">
      <Hero tone="stop" wally="stopped" title={t(R.stoppedTitle)} headingRef={headingRef} role="alert" fresh={fresh}>
        <p className="run-hero__sentence">{t(lead)}</p>
        {reason ? <p className="run-hero__sentence run-hero__sentence--sub">{t(reason)}</p> : null}
        <span className="run-hero__tags">
          {chip ? <Tag tone="stop" icon={<Icon name="hand" size={16} />}>{t(chip)}</Tag> : null}
          <ProvenanceChip prov={cartProv(decision.cart)} />
        </span>
      </Hero>
      <Card dashed className="run-nocard">
        <Icon name="card" size={22} />
        <span>{t(cancelled ? R.cardCancelled : R.noCard)}</span>
      </Card>
      <CardStory story={result.story} limitMinor={result.card?.limit_minor ?? decision.cart.total_minor} />
      <div className="run-actions">
        {onCheaper && budget ? <Button size="lg" block onClick={onCheaper}>{t(R.cheaper)}</Button> : null}
        {budget ? (
          <Button size="lg" variant={onCheaper ? "secondary" : "primary"} block icon={<Icon name="plus" size={20} />} onClick={onTopUp}>{t(R.topUp)}</Button>
        ) : (
          <Button size="lg" variant="secondary" block icon={<Icon name="sparkle" size={20} />} onClick={onAsk}>{t(R.ask)}</Button>
        )}
        <Button variant="ghost" block onClick={onWhy} icon={<Icon name="info" size={20} />}>{t(R.why)}</Button>
      </div>
      <Footnote />
    </div>
  );
}
