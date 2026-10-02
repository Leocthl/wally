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

/** Lane B's dev-only variant picker: #/styleguide/variants/run (see "Design decisions" in apps/web/README.md). */
export const VARIANTS_RUN_HASH = /^#\/?styleguide\/variants\/run(?:[/?]|$)/;
// import.meta.env.DEV is false in a production build, so this import and its chunk are dropped from the bundle and the
// PWA precache. The picker exists only on a dev server.
const RunVariants = import.meta.env.DEV ? lazy(() => import("./run/variants/RunVariants")) : null;

function readHash(): string {
  return window.location.hash;
}

export function StyleGuideRoute(): ReactElement {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const Page = RunVariants !== null && VARIANTS_RUN_HASH.test(hash) ? RunVariants : StyleGuide;
  return (
    <Suspense fallback={<p role="status" style={{ padding: "1rem" }}>Loading</p>}>
      <Page />
    </Suspense>
  );
}
