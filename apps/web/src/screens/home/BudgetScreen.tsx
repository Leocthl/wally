// Budget (#/budget, also #/ and #/booth), a shopper's home: Wally's greeting, a waiting "Needs your OK" and the "What do you need?"
// row (the way in, right under the hello), the budget card, Ideas for you, the one-off cards, Recent, the Add to Home Screen card
// (after a first purchase), the booth's scenario cards in a disclosure (Demo scenarios), and Manage this budget. Everything reads
// the booth state through the selectors, never its own copy.
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { navigate, PARAM, routeHref, useRouteParam } from "../../hooks/useRoute";
import { OB } from "../../i18n/onboarding";
import { UI } from "../../i18n/ui";
import { IosInstallHint } from "../../pwa/InstallUi";
import { countThisVisit } from "../../pwa/visits";
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
import { cardGroups, decisionTitle, hasCompletedPurchase, openEscalations, recentPurchases } from "./selectors";
import { PhotoCardSlot } from "./slots";
import { useDesktop } from "../../shell/layout";
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
  const [visits] = useState(countThisVisit);
  const desktop = useDesktop();
  const loaded = state.packet !== null && state.mandate !== null;
  // A person who narrowed what they shop for sees the matching cards first among the scenarios; the lead says so.
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
  // The Add to Home Screen card has earned its place after a first purchase went through, or when the person comes back.
  const installReady = visits >= 2 || hasCompletedPurchase(state);

  const cancel = async (): Promise<void> => {
    if (await attempt(booth, () => booth.api.revoke())) toast.show({ message: t(UI["console.cancelled"]), tone: "info" });
  };

  const manage = <ConsoleSection active={active} busy={busy} onCancel={() => void cancel()} />;
  // Three groups, in the phone's order: what is happening now, the shelf and the history, then the test console. On a phone the groups
  // dissolve (display: contents) and the page is one column; on a wide screen they are the three columns (home.css).
  return (
    <div className="home">
      <div className="home-col home-col--now">
        {/* The way in sits right under Wally's hello, above the figures: a question that is waiting comes first, then "What do you need?"
            (or, once the budget is over, the one card that starts a new one). */}
        <BudgetHero packet={packet} mandate={mandate}>
          {waiting.map((e) => <EscalationBanner key={e.decisionId} escalation={e} title={decisionTitle(state, e.decisionId)} />)}
          {closed ? (
            <Closed why={closed} />
          ) : (
            <div className="home-ask">
              <Composer />
              <PhotoCardSlot />
            </div>
          )}
        </BudgetHero>
        {/* Manage this budget is about the card above it: on a laptop it sits right under it. */}
        {desktop ? manage : null}
      </div>
      <div className="home-col home-col--shelf">
        {closed ? null : <Ideas onAsk={askIdea} busy={busy} />}
        <CardsSection active={cards.active} past={cards.past} />
        <RecentSection rows={recentPurchases(state)} />
        {/* Add to Home Screen waits for a first purchase or a second visit, and sits below the purchases, never above the greeting. */}
        <IosInstallHint ready={installReady} />
      </div>
      <div className="home-col home-col--test">
        {/* On a phone Manage this budget is the last block: the "Cancel the budget" scenario scrolls to it, and from the cards above it that is a short way. */}
        <DemoScenarios panel={desktop} lead={t(personal ? OB.home.tryLead : OB.home.demoLead)}>
          <TryAsking onRun={run} busy={busy} family={booth.info?.features?.family === true} variant={desktop ? "tabs" : "cards"} budgetCategories={mandate.rules.categories} />
          <div className="home-block__foot"><ResetDemo /></div>
        </DemoScenarios>
        {desktop ? null : manage}
      </div>
    </div>
  );
}
