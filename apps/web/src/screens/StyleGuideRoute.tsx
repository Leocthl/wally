// Route gate for #/styleguide. The style guide renders outside the booth shell (no API, no sealing) and is code-split,
// so the booth bundle does not carry it. App.tsx registers it with one line.
import { lazy, Suspense, useSyncExternalStore, type ReactElement } from "react";

export const STYLEGUIDE_HASH = /^#\/?styleguide(?:[/?]|$)/;

export function isStyleGuideHash(hash: string): boolean {
  return STYLEGUIDE_HASH.test(hash);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useStyleGuideRoute(): boolean {
  return useSyncExternalStore(subscribe, () => isStyleGuideHash(window.location.hash), () => false);
}

const StyleGuide = lazy(() => import("./StyleGuide"));

export function StyleGuideRoute(): ReactElement {
  return (
    <Suspense fallback={<p role="status" style={{ padding: "1rem" }}>Loading</p>}>
      <StyleGuide />
    </Suspense>
  );
}
