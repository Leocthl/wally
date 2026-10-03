// Receipts keep their identity across renders: the log is append-only, so an entry's receipt never changes. A memoised row
// then re-renders only when its own receipt does, and two hundred receipts stay smooth.
import { useMemo, useRef } from "react";
import type { LogEntry } from "../../api/types";
import { toReceipts, type Receipt } from "./receipts";

export function useStableReceipts(entries: readonly LogEntry[]): readonly Receipt[] {
  const cache = useRef(new WeakMap<LogEntry, Receipt>());
  return useMemo(() => {
    const fresh = toReceipts(entries);
    return entries.map((entry, i) => {
      const known = cache.current.get(entry);
      if (known) return known;
      const made = fresh[i] as Receipt;
      cache.current.set(entry, made);
      return made;
    });
  }, [entries]);
}
