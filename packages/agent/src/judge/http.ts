// Minimal HTTP layer over fetch: one attempt, abortable, redirects refused, response size capped.
// It never throws; every outcome is a value.

export type HttpOutcome =
  | { readonly kind: "response"; readonly status: number; readonly text: string }
  | { readonly kind: "aborted" }
  | { readonly kind: "too_large" }
  | { readonly kind: "network"; readonly detail: string };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
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
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

export async function sendRequest(
  fetchImpl: FetchLike,
  url: string,
  init: { readonly method: "GET" | "POST"; readonly headers: Readonly<Record<string, string>>; readonly body?: string },
  signal: AbortSignal,
  maxBytes: number,
): Promise<HttpOutcome> {
  try {
    // redirect: "error" because a judge endpoint that redirects is misconfigured or hostile; fail closed.
    const res = await fetchImpl(url, { ...init, headers: { ...init.headers }, signal, redirect: "error" });
    const text = await readCapped(res, maxBytes);
    return text === null ? { kind: "too_large" } : { kind: "response", status: res.status, text };
  } catch (err) {
    return signal.aborted ? { kind: "aborted" } : { kind: "network", detail: describeNetworkError(err) };
  }
}

/**
 * Error name and code only, never the message: a fetch message can quote a URL with a password in it or a
 * header value such as a Bearer key (S-JUDGE-3).
 */
function describeNetworkError(err: unknown): string {
  const name = err instanceof Error ? err.name : "Error";
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause : null;
  const raw = cause !== null && "code" in cause ? String((cause as { code?: unknown }).code) : "";
  const code = /^[A-Z0-9_]{1,40}$/.test(raw) ? raw : "";
  return `${name}${code.length > 0 ? ` (${code})` : ""}`.slice(0, 200);
}
