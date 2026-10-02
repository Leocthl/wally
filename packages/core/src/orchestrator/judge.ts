// The judge call: AbortSignal plus a hard deadline [F34]. A port that throws, hangs past the deadline or returns a
// record that fails its schema becomes a recorded ERROR or TIMEOUT, which R10 turns into ESCALATE (I5).
import type { JudgeInput, JudgePort, JudgeRecord } from "../ports";
import { validateJudgeRecord } from "../schema";

/** Label for model and version when the judge gave no usable record (schema needs non-empty strings). */
const UNAVAILABLE = "unavailable";

function failedRecord(judge: JudgePort, status: "TIMEOUT" | "ERROR", latencyMs: number): JudgeRecord {
  return { provider: judge.provider, model: UNAVAILABLE, version: UNAVAILABLE, status, latency_ms: latencyMs, shadow: false };
}

export async function assessWithDeadline(judge: JudgePort, input: JudgeInput, timeoutMs: number): Promise<JudgeRecord> {
  const started = performance.now();
  const latency = (): number => Math.max(0, Math.round(performance.now() - started));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([judge.assess(input, { timeoutMs, signal: controller.signal }), deadline]);
    if (result === "timeout") return failedRecord(judge, "TIMEOUT", latency());
    const checked = validateJudgeRecord(result);
    return checked.ok ? checked.value : failedRecord(judge, "ERROR", latency());
  } catch {
    return failedRecord(judge, "ERROR", latency()); // the port promised never to throw; fail closed
  } finally {
    clearTimeout(timer);
  }
}
