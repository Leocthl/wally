// A hard deadline for the live judge that sits between the orchestrator and the recorder. The orchestrator gives the judge
// F34 and builds its own TIMEOUT record when the time is up; if the adapter then answered a moment later, a recorder behind
// the adapter would keep that late answer and a replay would decide differently from the live run. With this layer the answer
// the orchestrator sees is the answer that is recorded: the layer's TIMEOUT comes first, and a late answer is dropped.
import type { JudgeInput, JudgePort, JudgeRecord } from "@laisee/core/ports";

/** The layer fires this many ms before the caller's own deadline so that its record, not the caller's, is the one used. */
const EARLY_MS = 2;

const timedOut = (provider: JudgePort["provider"], timeoutMs: number): JudgeRecord => ({
  provider,
  model: "unavailable",
  version: "deadline",
  status: "TIMEOUT",
  latency_ms: timeoutMs,
  shadow: false,
});

export function withDeadline(inner: JudgePort): JudgePort {
  return {
    provider: inner.provider,
    async assess(input: JudgeInput, opts: { timeoutMs: number; signal?: AbortSignal }): Promise<JudgeRecord> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<JudgeRecord>((resolve) => {
        timer = setTimeout(() => resolve(timedOut(inner.provider, opts.timeoutMs)), Math.max(1, opts.timeoutMs - EARLY_MS));
      });
      try {
        return await Promise.race([inner.assess(input, opts), deadline]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
