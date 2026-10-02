// #/styleguide/variants/<name>: the dev-only picker routes. Each name is one moment with its variants side by side.
// This module (and everything it imports) is reached only through a guarded dynamic import in StyleGuideRoute, so it is
// not in the production bundle or the PWA precache.
import { lazy, Suspense, type ComponentType, type ReactElement } from "react";

const ROUTES: Readonly<Record<string, ComponentType>> = {
  home: lazy(() => import("./HomeVariants")),
};

export default function Variants({ name }: { readonly name: string }): ReactElement {
  const Route = ROUTES[name];
  if (!Route) return <p style={{ padding: "1rem" }}>No variants named “{name}”. Try: {Object.keys(ROUTES).join(", ")}.</p>;
  return (
    <Suspense fallback={<p style={{ padding: "1rem" }}>Loading</p>}>
      <Route />
    </Suspense>
  );
}
