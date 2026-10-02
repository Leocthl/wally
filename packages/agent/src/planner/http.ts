// One JSON POST for the planner backends (Laya, the local Qwen server): abortable through an AbortController,
// redirects refused, response body read only up to a cap, never throws. Mirrors judge/http.ts (audit S-PLAN-1).
// Outcomes carry no text from fetch errors, so nothing upstream can echo a message into a trace or a log.

/** Largest response body read, in bytes: the judge's cap (judge/http.ts). Bigger answers fail closed. */
export const MAX_RESPONSE_BYTES = 1 << 20;

export type PostOutcome =
  | { readonly kind: "response"; readonly status: number; readonly text: string }
  | { readonly kind: "timeout" }
  | { readonly kind: "too_large" }
  | { readonly kind: "network" };

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (res.body === null) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/**
 * POSTs `body` as JSON to `url` and reads the answer within `timeoutMs` (whole milliseconds, at least 1).
 * redirect "error": an endpoint that redirects is misconfigured or hostile, and following it could send the
 * shopper's request to a host the loopback guard rejects.
 */
export async function postJson(url: string, body: string, timeoutMs: number, maxBytes: number = MAX_RESPONSE_BYTES): Promise<PostOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.floor(timeoutMs)));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
      redirect: "error",
    });
    const text = await readCapped(res, maxBytes);
    return text === null ? { kind: "too_large" } : { kind: "response", status: res.status, text };
  } catch {
    return controller.signal.aborted ? { kind: "timeout" } : { kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}
