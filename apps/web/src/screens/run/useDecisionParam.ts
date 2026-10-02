// The decision to show, from the hash route's query: #/wally?d=<decisionId> (Recent rows and Receipts link here).
// The shell owns navigation; this listens to hash changes and can drop the query in place (replaceState, no new
// history entry) once a newer run has taken the screen over, so tapping the same row again pins it again.
import { useCallback, useEffect, useState } from "react";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** "#/wally?d=dec_123" -> "dec_123"; anything that is not a plain id is ignored (untrusted input). */
export function decisionParam(hash: string): string | undefined {
  const query = hash.split("?")[1];
  if (query === undefined) return undefined;
  const value = new URLSearchParams(query).get("d");
  return value !== null && ID.test(value) ? value : undefined;
}

function hashWithoutQuery(hash: string): string {
  return hash.split("?")[0] || "#/wally";
}

export function useDecisionParam(): readonly [string | undefined, () => void] {
  const [value, setValue] = useState(() => (typeof window === "undefined" ? undefined : decisionParam(window.location.hash)));
  useEffect(() => {
    const onChange = (): void => setValue(decisionParam(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const clear = useCallback(() => {
    setValue(undefined);
    const { pathname, search, hash } = window.location;
    if (decisionParam(hash) !== undefined) window.history.replaceState(window.history.state, "", `${pathname}${search}${hashWithoutQuery(hash)}`);
  }, []);
  return [value, clear] as const;
}

/** Where a result row links: this screen pinned to one purchase. */
export function wallyHref(decisionId: string): string {
  return `#/wally?d=${encodeURIComponent(decisionId)}`;
}

export function receiptHref(decisionId: string): string {
  return `#/receipts?d=${encodeURIComponent(decisionId)}`;
}
