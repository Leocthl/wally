// Runs the corpus (and any extra listings) through a JudgePort, one call at a time: the Laya server has one
// inference worker, so parallel calls would only queue. Measures; never fabricates.
import type { Mandate } from "@laisee/core/generated";
import type { JudgeInput, JudgePort } from "@laisee/core/ports";
import type { CorpusCase } from "./corpus";
import { judgeInputFromListing } from "./inputs";
import type { CaseResult } from "./types";

export interface RunOptions {
  readonly judge: JudgePort;
  readonly timeoutMs: number;
  readonly mandate: Mandate;
  readonly onProgress?: ((done: number, total: number, id: string) => void) | undefined;
}

export function inputFor(c: CorpusCase, mandate: Mandate): JudgeInput {
  return judgeInputFromListing(c.listing, mandate, c.scameter_state);
}

async function runOne(c: CorpusCase, opts: RunOptions): Promise<CaseResult> {
  const record = await opts.judge.assess(inputFor(c, opts.mandate), { timeoutMs: opts.timeoutMs });
  return {
    id: c.id,
    category: c.category,
    labels: c.labels,
    scameterState: c.scameter_state,
    status: record.status,
    inputTruncated: record.input_truncated === true,
    latencyMs: record.latency_ms,
    answers: record.status === "OK" ? (record.answers ?? null) : null,
  };
}

export async function runCorpus(corpus: readonly CorpusCase[], opts: RunOptions): Promise<readonly CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of corpus) {
    results.push(await runOne(c, opts));
    opts.onProgress?.(results.length, corpus.length, c.id);
  }
  return results;
}
