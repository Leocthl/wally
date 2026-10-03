// The check behind plain Proof. The screen verifies the receipts on its own: when it opens, and again each time the log it
// shows changes. One check per log state, never while another call is running, never while the screen's own action
// (Check again, Try changing one receipt, Put it back) is running, and never again by itself when a check could not run:
// the person gets the button instead. The screen's own tamper and restore verify themselves, so the log state they leave
// behind counts as checked.
import { useCallback, useEffect, useRef, useState } from "react";
import type { VerifyOutcome } from "../../api/types";
import type { Booth } from "../../hooks/useBooth";
import type { LogState } from "../../state/booth";
import type { ProofStatus } from "./components/VerifyCard";

export type ProofAction = "auto" | "verify" | "tamper" | "restore";

/** One log state: the newest receipt and whether the shown copy is the changed one. Null when there is nothing to check. */
export function logKey(log: LogState): string | null {
  const head = log.head;
  if (log.entries.length === 0 || head === null) return null;
  const copy = log.tampered === null ? "stored" : `copy-${log.tampered.seq}-${log.tampered.field}`;
  return `${head.log_id}:${head.seq}:${head.entry_hash}:${copy}`;
}

export interface ProofCheck {
  /** What the screen is doing now; null when it is idle. */
  readonly action: ProofAction | null;
  readonly status: ProofStatus;
  /** The verdict of this visit. One left over from an earlier visit is never shown as this visit's. */
  readonly outcome: VerifyOutcome | null;
  /** The verdict on screen is about an older log state (receipts arrived, or the copy was put back or changed since). */
  readonly stale: boolean;
  readonly verify: () => void;
  readonly tamper: () => void;
  readonly restore: () => void;
}

export function useProofCheck(booth: Booth): ProofCheck {
  const { state, verifyOutcome, busy } = booth;
  const log = state.log;
  const key = logKey(log);
  const onCopy = log.tampered !== null;
  const [action, setAction] = useState<ProofAction | null>(null);
  /** The log state a check was last started for, as state (the card shows "checking" until then) and as a ref (the guard). */
  const [startedFor, setStartedFor] = useState<string | null>(null);
  const started = useRef<string | null>(null);
  /** The verdict the booth already held when this visit began: from an earlier visit, so never this visit's. */
  const inherited = useRef(verifyOutcome);
  /** The screen's own action ran and verified itself; the next quiet moment marks its log state as checked. */
  const own = useRef(false);
  const [verdictOnCopy, setVerdictOnCopy] = useState<boolean | null>(null);
  const latest = useRef(booth);
  latest.current = booth;

  const run = useCallback(async (kind: ProofAction, copy: boolean, task: () => Promise<void>): Promise<void> => {
    if (kind !== "auto") own.current = true;
    setVerdictOnCopy(copy);
    setAction(kind);
    try {
      await task();
    } finally {
      setAction(null);
    }
  }, []);

  useEffect(() => {
    if (key === null || busy || action !== null) return;
    if (own.current) {
      own.current = false;
      started.current = key;
      setStartedFor(key);
      return;
    }
    if (started.current === key) return;
    started.current = key;
    setStartedFor(key);
    void run("auto", onCopy, () => latest.current.verify());
  }, [key, busy, action, onCopy, run]);

  const verify = useCallback(() => void run("verify", onCopy, () => latest.current.verify()), [run, onCopy]);
  const tamper = useCallback(
    () =>
      void run("tamper", true, async () => {
        await latest.current.tamper();
        await latest.current.verify();
      }),
    [run],
  );
  const restore = useCallback(
    () =>
      void run("restore", false, async () => {
        await latest.current.restore();
        await latest.current.verify();
      }),
    [run],
  );

  // Every check makes a new outcome, so one that is still the one held at the start of this visit is not a result of this
  // visit: a check that could not run leaves the screen asking, not showing an old "untouched" as if it were just now.
  const outcome = verifyOutcome === inherited.current ? null : verifyOutcome;
  const result = outcome?.result ?? null;
  // A check is due and has not started yet (the screen just opened, or the budget was started over): say so, do not offer a button.
  const waiting = key !== null && result === null && action === null && startedFor !== key;
  const status: ProofStatus = action !== null || waiting ? "checking" : result === null ? "idle" : result.ok ? "pass" : "fail";
  const stale = result !== null && action === null && ((result.ok && log.head !== null && result.head.seq !== log.head.seq) || (verdictOnCopy !== null && verdictOnCopy !== onCopy));
  return { action, status, outcome, stale, verify, tamper, restore };
}
