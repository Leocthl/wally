// Budget (#/budget, also #/ and #/booth): the budget card, a waiting "Needs your OK", the one-off cards, Recent, Try
// asking, and Manage this budget. Everything reads the booth state through the selectors, never its own copy.
import { useEffect, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { PARAM, routeHref, useRouteParam } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { IosInstallHint } from "../../pwa/InstallUi";
import { Card, Skeleton } from "../../ui/Surface";
import { useLocale } from "../../ui/locale";
import { useToast } from "../../ui/Toast";
import { Wally } from "../../wally/Wally";
import { attempt, revealConsole, useScenarioRunner } from "../../shell/actions";
import { ResetDemo } from "../../shell/ResetDemo";
import { CardsSection } from "../console/CardsSection";
import { ConsoleSection } from "../console/ConsoleSection";
import { EscalationBanner } from "../console/EscalationBanner";
import { BudgetHero } from "./BudgetHero";
import { RecentSection } from "./RecentSection";
import { cardGroups, decisionTitle, openEscalations, recentDecisions } from "./selectors";
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

function Ended({ revoked }: { readonly revoked: boolean }): ReactElement {
  const { t } = useLocale();
  return (
    <Card padding="lg" className="home-ended" role="status">
      <Wally state="idle" size={72} decorative />
      <div className="home-ended__text">
        <p className="home-ended__title">{t(UI[revoked ? "home.cancelledTitle" : "home.endedTitle"])}</p>
        <p className="home-ended__body">{t(UI["home.cancelledBody"])}</p>
      </div>
      <a className="w-btn w-btn--primary w-btn--md w-btn--block" href={routeHref("seal")}><span className="w-btn__label">{t(UI["home.newBudget"])}</span></a>
    </Card>
  );
}

export function BudgetScreen(): ReactElement {
  const booth = useBoothContext();
  const { state, busy } = booth;
  const { t } = useLocale();
  const toast = useToast();
  const run = useScenarioRunner();
  const focus = useRouteParam(PARAM.focus);
  const loaded = state.packet !== null && state.mandate !== null;

  useEffect(() => {
    if (focus === "console" && loaded) revealConsole();
  }, [focus, loaded]);

  if (!state.packet || !state.mandate) return <BudgetSkeleton />;
  const { packet, mandate } = state;
  const active = packet.status === "ACTIVE" && !state.revoked;
  const cards = cardGroups(state);
  const waiting = openEscalations(state);

  const cancel = async (): Promise<void> => {
    if (await attempt(booth, () => booth.api.revoke())) toast.show({ message: t(UI["console.cancelled"]), tone: "info" });
  };

  return (
    <div className="home">
      <IosInstallHint />
      <BudgetHero packet={packet} mandate={mandate} />
      {active ? null : <Ended revoked={state.revoked || packet.status === "REVOKED"} />}
      {waiting.map((e) => <EscalationBanner key={e.decisionId} escalation={e} title={decisionTitle(state, e.decisionId)} />)}
      <CardsSection active={cards.active} past={cards.past} />
      <RecentSection rows={recentDecisions(state)} />
      <section className="home-block" aria-labelledby="home-try-title">
        <h2 id="home-try-title" className="home-block__title">{t(UI["home.tryAsking"])}</h2>
        <p className="home-block__lead">{t(UI["home.tryLead"])}</p>
        <TryAsking onRun={run} busy={busy} />
        <div className="home-block__foot"><ResetDemo /></div>
      </section>
      <ConsoleSection active={active} busy={busy} onCancel={() => void cancel()} />
    </div>
  );
}
