// describeImage: one picture in, a few typed attributes out. One grammar-constrained call to the local Qwen server
// (services/qwen, loopback only) with the picture as a data URI; code then re-checks every word of the answer. The
// model never decides anything here: a description only ranks simulated shop items for the person to look at.
// Never throws. The bytes are not logged or kept; the result carries only size, dimensions, latency and a reason word.
import { DEFAULT_LOCAL_MODEL, type ChatClient, type ChatFailure } from "../planner/local";
import { parseAttributes } from "./answer";
import { toBase64 } from "./base64";
import { checkImage, type ImageProblem } from "./image";
import { buildSeeMessages, buildSeeSchema, SEE_SCHEMA_NAME } from "./prompt";
import type { Attributes } from "./vocab";

/** Longest wait for the model, in ms. The brief's cap; 29 pictures took 1.7 to 2.9 s each on the booth Mac. */
export const DEFAULT_DESCRIBE_TIMEOUT_MS = 15_000;
/** Completion token cap: the longest valid answer, every field full, is about 60 tokens. */
export const DESCRIBE_MAX_TOKENS = 120;
/** Fixed sampling seed; temperature is always 0. */
export const DESCRIBE_SEED = 42;

export type DescribeReason = "ok" | ImageProblem | "model_unavailable" | "invalid_answer";

export interface Described {
  readonly attributes: Attributes | null;
  readonly reason: DescribeReason;
  /** The picture's size in bytes, and its pixels when the header was readable. */
  readonly bytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly latencyMs: number;
  /** Model name the server reported. */
  readonly model: string | null;
  /** Why the model call failed, when it did (a fixed word, never the server's text). */
  readonly failure: ChatFailure | null;
}

export interface DescribeOptions {
  readonly client: ChatClient;
  readonly model?: string;
  readonly timeoutMs?: number;
}

const refused = (reason: ImageProblem, bytes: number): Described => ({ attributes: null, reason, bytes, width: null, height: null, latencyMs: 0, model: null, failure: null });

export async function describeImage(bytes: Uint8Array, options: DescribeOptions): Promise<Described> {
  const size = bytes instanceof Uint8Array ? bytes.length : 0;
  try {
    const checked = checkImage(bytes);
    if (!checked.ok) return refused(checked.reason, size);
    const { mime, width, height } = checked.info;
    const base = { bytes: size, width, height };
    const res = await options.client.complete(
      {
        model: options.model ?? DEFAULT_LOCAL_MODEL,
        messages: buildSeeMessages(),
        schemaName: SEE_SCHEMA_NAME,
        schema: buildSeeSchema(),
        maxTokens: DESCRIBE_MAX_TOKENS,
        seed: DESCRIBE_SEED,
        image: { mime, base64: toBase64(bytes) },
      },
      options.timeoutMs ?? DEFAULT_DESCRIBE_TIMEOUT_MS,
    );
    if (!res.ok) return { ...base, attributes: null, reason: "model_unavailable", latencyMs: res.latencyMs, model: null, failure: res.reason };
    const attributes = parseAttributes(res.content);
    return { ...base, attributes, reason: attributes === null ? "invalid_answer" : "ok", latencyMs: res.latencyMs, model: res.model, failure: null };
  } catch {
    return { attributes: null, reason: "model_unavailable", bytes: size, width: null, height: null, latencyMs: 0, model: null, failure: "network" }; // never throws
  }
}
