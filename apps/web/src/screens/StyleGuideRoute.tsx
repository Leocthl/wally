// Route gate for #/styleguide. The style guide renders outside the booth shell (no API, no sealing) and is code-split,
// so the booth bundle does not carry it. App.tsx registers it with one line.
import { lazy, Suspense, useSyncExternalStore, type ReactElement } from "react";
import { variantName } from "./variants/variantsHash";

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

/** The dev-only picker routes (#/styleguide/variants/<name>). import.meta.env.DEV is replaced by false in a production
 *  build, so the branch, the import and everything behind it are gone from the bundle and the PWA precache. */
const Variants = import.meta.env.DEV ? lazy(() => import("./variants/Variants")) : null;

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function StyleGuideRoute(): ReactElement {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const variants = Variants ? variantName(hash) : null;
  if (Variants && variants) {
    return (
      <Suspense fallback={<p role="status" style={{ padding: "1rem" }}>Loading</p>}>
        <Variants name={variants} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<p role="status" style={{ padding: "1rem" }}>Loading</p>}>
      <StyleGuide />
    </Suspense>
  );
}
