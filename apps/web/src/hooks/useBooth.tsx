// useBooth: connects an ApiClient to the booth state. Subscribes once, loads info and a snapshot, seals the M0 preset
// when nothing is sealed (docs/06: "preset mandate sealed on load"), and wraps every call so a failure shows a message
// and mints nothing (I5). The UI never learns whether the client is the mock or the HTTP client beyond ApiInfo.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { ApiClient, ApiInfo, BoothSnapshot, ProposeRequest, ScenarioId, SealRequest, VerifyOutcome } from "../api/types";
import { m0Request } from "../booth/compile";
import { initialState, reduce, type BoothAction, type BoothState } from "../state/booth";

export interface Booth {
  readonly api: ApiClient;
  readonly state: BoothState;
  readonly info: ApiInfo | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly verifyOutcome: VerifyOutcome | null;
  runScenario(id: ScenarioId): Promise<void>;
  propose(req: ProposeRequest): Promise<void>;
  seal(req: SealRequest): Promise<void>;
  revoke(): Promise<void>;
  /** "closed": the question was already answered, or ended, somewhere else (a 409): no error to show, the screen says so itself. */
  answer(decisionId: string, choice: "APPROVE" | "DENY"): Promise<AnswerOutcome>;
  reset(): Promise<void>;
  verify(): Promise<void>;
  tamper(): Promise<void>;
  restore(): Promise<void>;
  /** Runs any ApiClient call under the same busy and error handling (the presenter script uses it). */
  exec(task: () => Promise<unknown>): Promise<void>;
  clearError(): void;
}

export type AnswerOutcome = "answered" | "closed" | "failed";

/** The booth refused an answer because the question is no longer open: another screen answered first, or R11 stopped it. */
function isClosedQuestion(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { readonly code?: unknown }).code === "ESCALATION_CLOSED";
}

const BoothContext = createContext<Booth | null>(null);

export function useBoothContext(): Booth {
  const booth = useContext(BoothContext);
  if (!booth) throw new Error("useBoothContext needs a BoothProvider");
  return booth;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

/** The booth could not be reached or did not answer in time (as opposed to a booth that answered "no"). */
function isConnectionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  const code = (err as { readonly code?: unknown }).code;
  return code === "NETWORK" || code === "TIMEOUT";
}

interface Failure {
  readonly message: string;
  /** Said the booth was out of reach: once the booth answers again, the message is out of date. */
  readonly connection: boolean;
}

interface Guard {
  readonly busy: boolean;
  /** True while any call this page made is waiting for its answer (read from handlers, so it is a ref and not state). */
  readonly callPending: () => boolean;
  readonly error: string | null;
  readonly guard: (task: () => Promise<unknown>) => Promise<void>;
  readonly clearError: () => void;
  /** Takes the message away only when it was about the booth being out of reach (a refusal is still true). */
  readonly clearConnectionError: () => void;
}

/** Counts calls in flight (busy) and turns a failure into a message instead of a frozen screen (I5: nothing is minted on error). */
function useGuard(): Guard {
  const [pending, setPending] = useState(0);
  const inFlight = useRef(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const guard = useCallback(async (task: () => Promise<unknown>): Promise<void> => {
    inFlight.current += 1;
    setPending((n) => n + 1);
    setFailure(null);
    try {
      await task();
    } catch (err) {
      setFailure({ message: messageOf(err), connection: isConnectionError(err) });
    } finally {
      inFlight.current -= 1;
      setPending((n) => n - 1);
    }
  }, []);
  return {
    busy: pending > 0,
    callPending: useCallback(() => inFlight.current > 0, []),
    error: failure?.message ?? null,
    guard,
    clearError: useCallback(() => setFailure(null), []),
    clearConnectionError: useCallback(() => setFailure((f) => (f?.connection === true ? null : f)), []),
  };
}

/** The soonest a phone waking up or coming back online reads the booth again after the last time it did. */
const WAKE_RESYNC_MIN_MS = 2_000;
/** Reads of the booth in one resync: one, and one more each time something arrived over the stream while reading. */
const MAX_RESYNC_READS = 3;
/** How long one read of the booth may take before the page gives up on it: a hung connection must not block the next try. */
const DEFAULT_RESYNC_TIMEOUT_MS = 8_000;

/** The task's answer, or a rejection when it has not answered in `ms` (the task itself is left to finish on its own). */
function within<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The booth did not answer in time")), ms);
    task.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (err: unknown) => (clearTimeout(timer), reject(err)),
    );
  });
}

export interface BoothProviderProps {
  readonly api: ApiClient;
  /**
   * Seal the ready-made budget when nothing is sealed (default). The first run turns it off while a new visitor sets up their
   * own. When it turns on later (setup ended some way other than a sealed budget) the booth is read again and the
   * ready-made budget is sealed then if there is still none, so leaving the first run never leaves Budget empty.
   */
  readonly autoSeal?: boolean;
  /** How long one re-read of the booth may take before the page gives up on it (default 8 s). */
  readonly resyncTimeoutMs?: number;
  readonly children: ReactNode;
}

export function BoothProvider({ api, autoSeal = true, resyncTimeoutMs = DEFAULT_RESYNC_TIMEOUT_MS, children }: BoothProviderProps): ReactElement {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [verifyOutcome, setVerifyOutcome] = useState<VerifyOutcome | null>(null);
  const { busy, callPending, error, guard, clearError, clearConnectionError } = useGuard();
  const started = useRef(false);
  const loaded = useRef(false);
  const sealTried = useRef(false);
  const wantSeal = useRef(autoSeal);
  useEffect(() => {
    wantSeal.current = autoSeal;
  }, [autoSeal]);

  // Counts what the live stream said, so a re-read can tell that something arrived while it was reading.
  const heard = useRef(0);
  useEffect(
    () =>
      api.subscribe((e) => {
        heard.current += 1;
        dispatch(e as BoothAction);
      }),
    [api],
  );

  // A verdict belongs to one log: a new seal (a new log) or a reset starts without one.
  const logId = state.packet?.log_id;
  useEffect(() => setVerifyOutcome(null), [logId]);

  /** The ready-made budget, tried at most once per connection: only when the booth holds none (`known` is that reading, or it is read now). */
  const sealIfEmpty = useCallback(
    async (known: BoothSnapshot | null): Promise<void> => {
      if (sealTried.current) return;
      sealTried.current = true;
      const snap = known ?? (await api.snapshot());
      if (!snap.mandate) await api.seal(m0Request(new Date()));
    },
    [api],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void guard(async () => {
      const [i, snap] = await Promise.all([api.info(), api.snapshot()]);
      setInfo(i);
      dispatch({ type: "snapshot", snapshot: snap });
      loaded.current = true;
      if (wantSeal.current) await sealIfEmpty(snap);
    });
  }, [api, guard, sealIfEmpty]);

  /**
   * Reads the booth again and takes what it says as the truth: events from a gap in the connection are not replayed, and a booth that
   * restarted has a log of its own. A page that lost the booth and finds it again clears the "could not be reached" message it left.
   * Unreachable (or silent for too long) still: nothing changes and nothing new is shown; the next trigger tries again. A trigger that
   * comes in while a read is under way is not lost: the read runs once more when this one is done. Says whether the booth was read.
   */
  const resyncing = useRef(false);
  const rerun = useRef(false);
  const readBooth = useCallback(async (): Promise<boolean> => {
    try {
      for (let attempt = 1; attempt <= MAX_RESYNC_READS; attempt++) {
        const before = heard.current;
        const [i, snap] = await within(Promise.all([api.info(), api.snapshot()]), resyncTimeoutMs);
        // An event that came in while the booth was being read may be newer than the answer: read again, so the answer cannot
        // replace what the page has just heard with something older.
        if (heard.current !== before && attempt < MAX_RESYNC_READS) continue;
        setInfo(i);
        dispatch({ type: "resync", snapshot: snap });
        clearConnectionError();
        return true;
      }
    } catch {
      // out of reach still
    }
    return false;
  }, [api, clearConnectionError, resyncTimeoutMs]);
  const resync = useCallback(async (): Promise<boolean> => {
    if (!loaded.current) return false;
    if (resyncing.current) {
      rerun.current = true;
      return false;
    }
    resyncing.current = true;
    let read = false;
    try {
      do {
        rerun.current = false;
        read = (await readBooth()) || read;
      } while (rerun.current);
    } finally {
      resyncing.current = false;
    }
    return read;
  }, [readBooth]);

  // The live connection came back (the booth restarted, or the network did): read the booth again.
  useEffect(() => api.onReconnect?.(() => void resync()), [api, resync]);

  // A phone that sleeps loses its connection without knowing it: waking up or coming back online reads the booth again too.
  useEffect(() => {
    if (api.kind !== "http") return undefined;
    let last = 0;
    const wake = (): void => {
      // A call this page is waiting on has the live stream to bring its answer: reading behind it would cut its run off.
      if (document.visibilityState === "hidden" || callPending() || Date.now() - last < WAKE_RESYNC_MIN_MS) return;
      void resync().then((read) => {
        if (read) last = Date.now();
      });
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [api, resync, callPending]);

  // autoSeal turned on after the booth had loaded: seal the ready-made budget now, if the booth still holds none.
  useEffect(() => {
    if (autoSeal && loaded.current) void guard(() => sealIfEmpty(null));
  }, [autoSeal, guard, sealIfEmpty]);

  const showLog = useCallback(async () => dispatch({ type: "log.view", view: await api.getLog() }), [api]);

  const booth = useMemo<Booth>(
    () => ({
      api, state, info, busy, error, verifyOutcome, clearError, exec: guard,
      runScenario: (id) => guard(() => api.runScenario(id)),
      propose: (req) => guard(() => api.propose(req)),
      seal: (req) => guard(() => api.seal(req)),
      revoke: () => guard(() => api.revoke()),
      answer: async (decisionId, choice) => {
        let outcome: AnswerOutcome = "failed";
        await guard(async () => {
          try {
            await api.answerEscalation({ decisionId, choice });
            outcome = "answered";
          } catch (err) {
            if (!isClosedQuestion(err)) throw err;
            outcome = "closed"; // not a failure to report: the question was settled while this screen was waiting
          }
        });
        return outcome;
      },
      reset: () => guard(async () => {
        setVerifyOutcome(null);
        await api.reset();
      }),
      verify: () => guard(async () => setVerifyOutcome(await api.verify())),
      tamper: () => guard(async () => {
        setVerifyOutcome(null);
        await api.tamper();
        await showLog();
      }),
      restore: () => guard(async () => {
        setVerifyOutcome(null);
        await api.restore();
        await showLog();
      }),
    }),
    [api, state, info, busy, error, verifyOutcome, clearError, guard, showLog],
  );

  return <BoothContext.Provider value={booth}>{children}</BoothContext.Provider>;
}
