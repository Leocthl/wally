// useBooth: connects an ApiClient to the booth state. Subscribes once, loads info and a snapshot, seals the M0 preset
// when nothing is sealed (docs/06: "preset mandate sealed on load"), and wraps every call so a failure shows a message
// and mints nothing (I5). The UI never learns whether the client is the mock or the HTTP client beyond ApiInfo.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { ApiClient, ApiInfo, ProposeRequest, ScenarioId, SealRequest, VerifyOutcome } from "../api/types";
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
  answer(decisionId: string, choice: "APPROVE" | "DENY"): Promise<void>;
  reset(): Promise<void>;
  verify(): Promise<void>;
  tamper(): Promise<void>;
  restore(): Promise<void>;
  /** Runs any ApiClient call under the same busy and error handling (the presenter script uses it). */
  exec(task: () => Promise<unknown>): Promise<void>;
  clearError(): void;
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

/** Counts calls in flight (busy) and turns a failure into a message instead of a frozen screen (I5: nothing is minted on error). */
function useGuard(): { readonly busy: boolean; readonly error: string | null; readonly guard: (task: () => Promise<unknown>) => Promise<void>; readonly clearError: () => void } {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const guard = useCallback(async (task: () => Promise<unknown>): Promise<void> => {
    setPending((n) => n + 1);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending((n) => n - 1);
    }
  }, []);
  return { busy: pending > 0, error, guard, clearError: useCallback(() => setError(null), []) };
}

export function BoothProvider({ api, children }: { readonly api: ApiClient; readonly children: ReactNode }): ReactElement {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [info, setInfo] = useState<ApiInfo | null>(null);
  const [verifyOutcome, setVerifyOutcome] = useState<VerifyOutcome | null>(null);
  const { busy, error, guard, clearError } = useGuard();
  const started = useRef(false);

  useEffect(() => api.subscribe((e) => dispatch(e as BoothAction)), [api]);

  // A verdict belongs to one log: a new seal (a new log) or a reset starts without one.
  const logId = state.packet?.log_id;
  useEffect(() => setVerifyOutcome(null), [logId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void guard(async () => {
      const [i, snap] = await Promise.all([api.info(), api.snapshot()]);
      setInfo(i);
      dispatch({ type: "snapshot", snapshot: snap });
      if (!snap.mandate) await api.seal(m0Request(new Date()));
    });
  }, [api, guard]);

  const showLog = useCallback(async () => dispatch({ type: "log.view", view: await api.getLog() }), [api]);

  const booth = useMemo<Booth>(
    () => ({
      api, state, info, busy, error, verifyOutcome, clearError, exec: guard,
      runScenario: (id) => guard(() => api.runScenario(id)),
      propose: (req) => guard(() => api.propose(req)),
      seal: (req) => guard(() => api.seal(req)),
      revoke: () => guard(() => api.revoke()),
      answer: (decisionId, choice) => guard(() => api.answerEscalation({ decisionId, choice })),
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
