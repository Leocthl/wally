// App shell: header (PACKET), rail badge top right, screens by hash route, footer on every screen.
// The ApiClient is injected, so the same shell runs on the offline mock and, later, on the HTTP + SSE client.
import type { ReactElement } from "react";
import type { ApiClient } from "./api/types";
import { Footer, RailBadge } from "./components/RailBadge";
import { Bi } from "./components/Bi";
import { BoothProvider, useBoothContext } from "./hooks/useBooth";
import { ROUTES, useRoute, type Route } from "./hooks/useRoute";
import { S } from "./i18n/strings";
import { BoothScreen } from "./screens/BoothScreen";
import { LogPanel } from "./screens/LogPanel";
import { PacketPanel } from "./screens/PacketPanel";
import { PresenterScreen } from "./screens/PresenterScreen";
import { RunPanel } from "./screens/RunPanel";
import { SealPanel } from "./screens/SealPanel";

const NAV: readonly { readonly route: Route; readonly title: typeof S.navBooth }[] = [
  { route: "booth", title: S.navBooth },
  { route: "seal", title: S.navSeal },
  { route: "presenter", title: S.navPresenter },
];

function Screen({ route }: { readonly route: Route }): ReactElement {
  switch (route) {
    case "seal":
      return <SealPanel />;
    case "run":
      return <RunPanel />;
    case "console":
      return <PacketPanel />;
    case "log":
      return <LogPanel />;
    case "presenter":
      return <PresenterScreen />;
    case "booth":
      return <BoothScreen />;
  }
}

function Shell(): ReactElement {
  const [route] = useRoute();
  const { info, error, clearError } = useBoothContext();
  return (
    <div className="shell" data-route={route}>
      <a className="sr-only" href="#main">Skip to content</a>
      <header className="site-header" data-register="packet">
        <h1>
          <span>{S.appName.en}</span>
          <span lang="zh-HK">{S.appName.zh}</span>
        </h1>
        <RailBadge />
        <nav className="nav" aria-label="Screens">
          {NAV.map(({ route: r, title }) => (
            <a key={r} href={`#/${r}`} {...(route === r || (r === "booth" && !NAV.some((n) => n.route === route) && ROUTES.includes(route)) ? { "aria-current": "page" as const } : {})}>
              <Bi text={title} />
            </a>
          ))}
        </nav>
      </header>
      {error ? (
        <p role="alert" className="app-error">
          {error} <button type="button" className="btn tap" onClick={clearError}>Dismiss</button>
        </p>
      ) : null}
      <main id="main" tabIndex={-1}>
        <Screen route={route} />
      </main>
      <Footer replayed={info?.replayed ?? false} />
    </div>
  );
}

export function App({ api }: { readonly api: ApiClient }): ReactElement {
  return (
    <BoothProvider api={api}>
      <Shell />
    </BoothProvider>
  );
}
