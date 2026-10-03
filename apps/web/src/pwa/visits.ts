// How many visits this browser has made, for the Add to Home Screen card: it is offered on a second visit (or after the first
// purchase), never to someone who has only just arrived. A visit is one browsing session: a reload inside it is the same visit.
// Pure helpers take the storages they read, so a test needs no browser; storage may be refused (private mode), and then
// nothing is counted and the card simply waits for the first purchase.

export const VISITS_KEY = "wally:visits";
export const VISIT_COUNTED_KEY = "wally:visit-counted";

/** The slice of Storage these helpers use. */
export interface VisitStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readCount(storage: Pick<VisitStorage, "getItem">): number {
  const n = Number(storage.getItem(VISITS_KEY));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

/**
 * Counts this session once and returns the number of visits so far (this one included). Calling it again in the same session
 * returns the same number. 0 when storage refuses: an unknown count is never taken for a second visit.
 */
export function countVisit(local: VisitStorage | null, session: VisitStorage | null): number {
  try {
    if (local === null || session === null) return 0;
    const before = readCount(local);
    if (session.getItem(VISIT_COUNTED_KEY) === "1") return before;
    const next = before + 1;
    local.setItem(VISITS_KEY, String(next));
    session.setItem(VISIT_COUNTED_KEY, "1");
    return next;
  } catch {
    return 0;
  }
}

function pageStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

/** This page's visit count, counted once per session. */
export function countThisVisit(): number {
  return countVisit(pageStorage("localStorage"), pageStorage("sessionStorage"));
}
