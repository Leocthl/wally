// Budget (#/budget, also #/ and #/booth), a shopper's home: Wally's greeting and the budget card, the "What do you need?" row,
// Ideas for you, a waiting "Needs your OK", the one-off cards, Recent, the booth's scenario cards in a disclosure (Demo scenarios,
// for judges), and Manage this budget. Everything reads the booth state through the selectors, never its own copy.
import { useCallback, useEffect, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { navigate, PARAM, routeHref, useRouteParam } from "../../hooks/useRoute";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { IosInstallHint } from "../../pwa/InstallUi";
import { useProfile } from "../../state/useProfile";
import { Card, Skeleton } from "../../ui/Surface";
import { useLocale } from "../../ui/locale";
import { useToast } from "../../ui/Toast";
import { Wally } from "../../wally/Wally";
import { attempt, revealConsole, useAsker, useScenarioRunner } from "../../shell/actions";
import { noteAsk } from "../run/askEcho";
import { ResetDemo } from "../../shell/ResetDemo";
import { CardsSection } from "../console/CardsSection";
import { ConsoleSection } from "../console/ConsoleSection";
import { EscalationBanner } from "../console/EscalationBanner";
import { BudgetHero } from "./BudgetHero";
import { Composer } from "./Composer";
import { DemoScenarios } from "./DemoScenarios";
import { useFamilyRunner } from "./familyRun";
import { Ideas } from "./IdeasSection";
import type { Idea } from "./ideas";
import { RecentSection } from "./RecentSection";
import { cardGroups, decisionTitle, openEscalations, recentDecisions } from "./selectors";
import { PhotoCardSlot } from "./slots";
import { TRY_ITEMS } from "./tryCatalog";
import { rankTryItems } from "./tryRank";
import { TryAsking } from "./TryAsking";
import "./home.css";

function BudgetSkeleton(): ReactElement {
  const { t } = useLocale();
  return (
    <div className="home home--loading" aria-busy="true">
      <Card tone="sunken" padding="lg" className="home-hero-skeleton">
        <span className="sr-only">{t(UI.loading)}</span>
        <Skeleton width="40%" height="0.875rem" />
        <Skeleton width="65%" height="3rem" radius="md" />
        <Skeleton width="100%" height="0.625rem" radius="pill" />
        <Skeleton lines={2} />
      </Card>
    </div>
  );
}

type Closed = "cancelled" | "ended" | "usedUp";

const CLOSED_TEXT = {
  cancelled: { title: "home.cancelledTitle", body: "home.cancelledBody", action: "home.newBudget" },
  ended: { title: "home.endedTitle", body: "home.cancelledBody", action: "home.newBudget" },
  usedUp: { title: "home.usedUpTitle", body: "home.usedUpBody", action: "console.topUp" },
} as const;

/** Cancelled, ended or all used: say so, and offer the one next step (a new budget, or a top up). */
function Closed({ why }: { readonly why: Closed }): ReactElement {
  const { t } = useLocale();
  const text = CLOSED_TEXT[why];
  const href = why === "usedUp" ? routeHref("seal", { [PARAM.mode]: "topup" }) : routeHref("seal");
  return (
    <Card padding="lg" className="home-ended" role="status">
      <Wally state="idle" size={72} decorative />
      <div className="home-ended__text">
        <p className="home-ended__title">{t(UI[text.title])}</p>
        <p className="home-ended__body">{t(UI[text.body])}</p>
      </div>
      <a className="w-btn w-btn--primary w-btn--md w-btn--block" href={href}><span className="w-btn__label">{t(UI[text.action])}</span></a>
    </Card>
  );
}

function closedWhy(status: string, revoked: boolean): Closed | null {
  if (revoked || status === "REVOKED") return "cancelled";
  if (status === "EXPIRED") return "ended";
  if (status === "EXHAUSTED") return "usedUp";
  return null;
}

export function BudgetScreen(): ReactElement {
  const booth = useBoothContext();
  const { state, busy } = booth;
  const { t } = useLocale();
  const toast = useToast();
  const runScenario = useScenarioRunner();
  const run = useFamilyRunner(runScenario);
  const asker = useAsker();
  const focus = useRouteParam(PARAM.focus);
  const { profile } = useProfile();
  const loaded = state.packet !== null && state.mandate !== null;
  // A person who told Wally their taste sees their picks first among the scenario cards; the lead says so.
  const personal = rankTryItems(TRY_ITEMS, profile).forYou.size > 0;
  // An idea asks Wally for the item as if it were typed; a booth that cannot take a typed ask runs the same item's scenario.
  const askIdea = useCallback(
    (idea: Idea) => {
      if (asker) {
        noteAsk(idea.ask);
        asker(idea.ask);
      } else runScenario(idea.scenario);
    },
    [asker, runScenario],
  );

  // #/budget?focus=console (the old #/console, Cancel the budget): reveal once, then drop the param so later changes
  // on this screen never pull the page down again.
  useEffect(() => {
    if (focus !== "console" || !loaded) return;
    revealConsole();
    navigate("budget", {}, { replace: true });
  }, [focus, loaded]);

  if (!state.packet || !state.mandate) return <BudgetSkeleton />;
  const { packet, mandate } = state;
  const closed = closedWhy(packet.status, state.revoked);
  // All used is still a live budget: it can be topped up or cancelled. Cancelled and ended are over.
  const active = closed === null || closed === "usedUp";
  const cards = cardGroups(state);
  // A cancelled budget cannot approve anything, so nothing is waiting for an answer there.
  const waiting = active ? openEscalations(state) : [];

  const cancel = async (): Promise<void> => {
    if (await attempt(booth, () => booth.api.revoke())) toast.show({ message: t(UI["console.cancelled"]), tone: "info" });
  };

  return (
    <div className="home">
      <IosInstallHint />
      <BudgetHero packet={packet} mandate={mandate} />
      {closed ? <Closed why={closed} /> : <Composer />}
      {closed ? null : <PhotoCardSlot />}
      {waiting.map((e) => <EscalationBanner key={e.decisionId} escalation={e} title={decisionTitle(state, e.decisionId)} />)}
      {closed ? null : <Ideas onAsk={askIdea} busy={busy} />}
      <CardsSection active={cards.active} past={cards.past} />
      <RecentSection rows={recentDecisions(state)} />
      {/* Manage this budget stays the last block: the "Cancel the budget" scenario scrolls to it, and from the cards above it that is a short way. */}
      <DemoScenarios lead={t(personal ? OB.home.tryLead : OB.home.demoLead)}>
        <TryAsking onRun={run} busy={busy} family={booth.info?.features?.family === true} />
        <div className="home-block__foot"><ResetDemo /></div>
      </DemoScenarios>
      <ConsoleSection active={active} busy={busy} onCancel={() => void cancel()} />
    </div>
  );
}
