// Hash routing without a dependency: the booth works from a static file and a phone browser with no server.
import { useCallback, useEffect, useState } from "react";

export const ROUTES = ["booth", "seal", "run", "console", "log", "presenter"] as const;
export type Route = (typeof ROUTES)[number];

export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, "").split(/[/?]/)[0] ?? "";
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : "booth";
}

export function useRoute(): readonly [Route, (next: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((next: Route) => {
    window.location.hash = `/${next}`;
  }, []);
  return [route, go];
}
