// A small typed-choice client interface. Laya (and Jev, same wire format) answer multiple-choice questions with a
// probability per option. B0 talks to the model through this directly; the judge adapter builds on it too.

export interface ChoiceOption {
  readonly label: string;
  readonly description: string;
}

export interface ChoiceQuestion {
  readonly id: string;
  readonly instructions: string;
  /** Canonical option order. Labels are semantic words, never yes/no (Laya README warns about boolean-word labels). */
  readonly options: readonly ChoiceOption[];
}

export interface ChoiceRequest {
  readonly state: unknown;
  readonly questions: readonly ChoiceQuestion[];
}

export interface ChoiceAnswer {
  /** Argmax label. */
  readonly choice: string;
  /** Probability per option, in the caller's own option order, summing to 1. */
  readonly probabilities: Readonly<Record<string, number>>;
}

export interface ChoiceMeta {
  readonly model: string;
  readonly revision: string | null;
}

export type ChoiceResult =
  | {
      readonly ok: true;
      readonly answers: Readonly<Record<string, ChoiceAnswer>>;
      /** Laya's usage.truncated: the tail of the state was dropped, so the model did not see all of it [F26]. */
      readonly truncated: boolean;
      readonly latencyMs: number;
      readonly meta: ChoiceMeta;
    }
  | { readonly ok: false; readonly status: "TIMEOUT" | "ERROR"; readonly reason: string; readonly latencyMs: number };

export interface AskOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export type ChoiceClientKind = "live" | "recorded" | "fake" | "unavailable";

export interface ChoiceClient {
  readonly kind: ChoiceClientKind;
  /** Never throws: a failure is a value with status TIMEOUT or ERROR, which every caller treats as fail closed (I5). */
  ask(req: ChoiceRequest, opts: AskOptions): Promise<ChoiceResult>;
}

export function argmax(probabilities: Readonly<Record<string, number>>): string {
  const entries = Object.entries(probabilities);
  const best = entries.reduce<[string, number] | null>((acc, e) => (acc === null || e[1] > acc[1] ? e : acc), null);
  if (best === null) throw new RangeError("argmax of an empty distribution");
  return best[0];
}

export const PROBABILITY_SUM_TOLERANCE = 1e-3;
