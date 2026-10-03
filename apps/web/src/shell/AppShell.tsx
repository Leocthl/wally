// The app shell: top bar, the routed screen, the bottom tabs with the raised Ask button, the Ask and About sheets, and
// the connection and failure states. A phone-width column on wide screens; the presenter screen gets the full width.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react";
import { BRAND } from "../brand";
import { useBoothContext } from "../hooks/useBooth";
import { navigate, routeHref, useRoute, type Route } from "../hooks/useRoute";
import { PHOTO } from "../i18n/photo";
import { UI } from "../i18n/ui";
import { cx } from "../ui/cx";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";
import { Button } from "../ui/Button";
import { BottomTabBar, type TabItem } from "../ui/Nav";
import { Skeleton } from "../ui/Surface";
import { useToast } from "../ui/Toast";
import type { PhotoSource } from "../screens/photo/usePhotoFlow";
import type { SuggestRules } from "../screens/seal/sealModel";
import { AboutSheet } from "./AboutSheet";
import { ASK_EVENT } from "./askEvent";
import { AskSheet, type AskWally } from "./AskSheet";
import { CantReach, ConnectionBanners } from "./Connection";
import { ErrorBoundary } from "./ErrorBoundary";
import { useDesktop } from "./layout";
import { prefetchRoutes, RouteView, tabFor } from "./routes";
import { ShellBar } from "./ShellBar";
import { ShellProvider } from "./ShellContext";
import { SheetBoundary } from "./SheetBoundary";
import { TopNav } from "./TopNav";
import { useTheme } from "./theme";
import "./shell.css";

// Show Wally a photo, and the shopper's own words: the sheet that finds the items is its own chunk, loaded the first time it is
// needed. A failed load is forgotten (a new lazy component is made), so the next try asks the network again.
const loadPhotoSheet = (): ReturnType<typeof importPhotoSheet> =>
  importPhotoSheet().catch((err: unknown) => {
    PhotoSheet = lazy(loadPhotoSheet);
    throw err;
  });
const importPhotoSheet = () => import("../screens/photo/PhotoSheet");
let PhotoSheet = lazy(loadPhotoSheet);

const PREFETCH_DELAY_MS = 1200;
/** Screens that never show the tab bar: Seal is a focused flow, the presenter is a stage. */
const NO_TABS = new Set(["seal", "presenter"]);
/** Screens the first-run gate leaves alone (they work without a budget). */
const NO_GATE = new Set(["seal", "presenter", "evidence", "styleguide"]);

function useTabs(): readonly TabItem[] {
  const { t } = useLocale();
  return [
    { id: "budget", label: t(UI.tabBudget), icon: <Icon name="wallet" />, href: routeHref("budget") },
    { id: "wally", label: t(UI.tabWally), icon: <Icon name="chat" />, href: routeHref("wally") },
    { id: "receipts", label: t(UI.tabReceipts), icon: <Icon name="receipt" />, href: routeHref("receipts") },
    { id: "proof", label: t(UI.tabProof), icon: <Icon name="shieldCheck" />, href: routeHref("proof") },
  ];
}

/** <html lang> follows the language switch, so sheets (portalled to <body>) are marked too. */
function useDocumentLang(locale: string): void {
  useEffect(() => {
    const before = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = before;
    };
  }, [locale]);
}

/** No budget sealed after loading (the preset could not be sealed): go to Seal. */
function useFirstRunGate(route: Route): void {
  const { info, busy, state } = useBoothContext();
  const needsSeal = info !== null && !busy && state.mandate === null;
  useEffect(() => {
    if (needsSeal && !NO_GATE.has(route.name)) navigate("seal", {}, { replace: true });
  }, [needsSeal, route.name]);
}

/** New screen: start at the top and move focus to it, so a screen reader hears where it is. */
function useScreenFocus(name: string): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [name]);
}

function usePrefetch(): void {
  useEffect(() => {
    const timer = setTimeout(() => prefetchRoutes(), PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
}

function ScreenLoading(): ReactElement {
  const { t } = useLocale();
  return (
    <div className="shell-loading" data-route-loading role="status">
      <span className="sr-only">{t(UI["shell.screenLoading"])}</span>
      <Skeleton width="55%" height="1.75rem" radius="md" />
      <Skeleton width="100%" height="8rem" radius="md" />
      <Skeleton lines={3} />
    </div>
  );
}

export interface AppShellProps {
  readonly onRetry: () => void;
  readonly suggestRules?: SuggestRules;
  readonly onAsk?: AskWally;
}

export function AppShell({ onRetry, suggestRules, onAsk }: AppShellProps): ReactElement {
  const route = useRoute();
  const { t, locale } = useLocale();
  const { info, error } = useBoothContext();
  const [theme, setTheme] = useTheme();
  const [asking, setAsking] = useState(false);
  const [about, setAbout] = useState(false);
  const [photo, setPhoto] = useState<PhotoSource | null>(null);
  const toast = useToast();
  const tabs = useTabs();
  useDocumentLang(locale);
  useFirstRunGate(route);
  useScreenFocus(route.name);
  usePrefetch();

  // Moving to another screen closes the sheets (their links navigate).
  useEffect(() => {
    setAsking(false);
    setAbout(false);
    setPhoto(null);
  }, [route.name]);

  const openAsk = useCallback(() => setAsking(true), []);
  const showPhoto = useCallback((file: File) => {
    setAsking(false);
    setPhoto({ kind: "picture", file });
  }, []);
  const showShopSearch = useCallback((text: string) => {
    setAsking(false);
    setPhoto({ kind: "words", text });
  }, []);
  const photoFailed = useCallback(() => {
    setPhoto(null);
    toast.show({ message: t(PHOTO.openFailed), tone: "stop" });
  }, [toast, t]);
  const openAbout = useCallback(() => setAbout(true), []);
  // Screens without a handle on the shell (Wally's idle and stopped states) ask for the sheet with a window event.
  useEffect(() => {
    window.addEventListener(ASK_EVENT, openAsk);
    return () => window.removeEventListener(ASK_EVENT, openAsk);
  }, [openAsk]);
  const skip = (e: MouseEvent<HTMLAnchorElement>): void => {
    e.preventDefault(); // "#main" is not a route
    document.getElementById("main")?.focus();
  };

  const wide = route.name === "presenter";
  const desktop = useDesktop();
  const tabbar = !NO_TABS.has(route.name);
  const failedToLoad = info === null && error !== null;

  return (
    <ShellProvider openAsk={openAsk} openAbout={openAbout} showPhoto={showPhoto} showShopSearch={showShopSearch}>
      <div className={cx("shell-app", wide && "shell-app--wide", tabbar && !desktop && "shell-app--tabs", desktop && "shell-app--desktop")} data-route={route.name} data-layout={desktop ? "desktop" : "phone"} lang={locale} data-chip-scope>
        <a className="sr-only" href="#main" onClick={skip}>{t(UI["shell.skip"])}</a>
        <ShellBar
          onAbout={openAbout}
          {...(desktop && tabbar ? { nav: <TopNav label={t(UI.mainNav)} items={tabs} current={tabFor(route.name)} /> } : {})}
          {...(desktop && tabbar ? { action: <Button size="sm" className="shell-ask" onClick={openAsk}>{t(UI.run.ask)}</Button> } : {})}
        />
        <ConnectionBanners />
        <main id="main" tabIndex={-1} className="shell-main">
          {failedToLoad ? (
            <CantReach onRetry={onRetry} />
          ) : (
            <ErrorBoundary resetKey={route.name}>
              <Suspense fallback={<ScreenLoading />}>
                <RouteView route={route} {...(suggestRules ? { suggestRules } : {})} />
              </Suspense>
            </ErrorBoundary>
          )}
        </main>
        {tabbar && !desktop ? (
          <BottomTabBar label={t(UI.mainNav)} items={tabs} current={tabFor(route.name)} center={{ label: t(UI["shell.ask"](BRAND.name)), icon: <Icon name="chat" size={26} />, onPress: openAsk }} />
        ) : null}
        <AskSheet open={asking} onClose={() => setAsking(false)} {...(onAsk ? { onAsk } : {})} />
        <AboutSheet open={about} onClose={() => setAbout(false)} theme={theme} onTheme={setTheme} />
        {photo !== null ? (
          <SheetBoundary onFail={photoFailed}>
            <Suspense fallback={<p className="sr-only" role="status">{t(PHOTO.opening)}</p>}>
              <PhotoSheet source={photo} onClose={() => setPhoto(null)} onPickFile={showPhoto} />
            </Suspense>
          </SheetBoundary>
        ) : null}
      </div>
    </ShellProvider>
  );
}
