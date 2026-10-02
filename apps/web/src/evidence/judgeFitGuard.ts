// Guard for data/results/judge-fit-*.json. Reads schema judge-fit/v1 and judge-fit/v2 into one shape (judgeFit.ts);
// anything else is refused with reasons in words, so the panel says the file could not be read instead of guessing.
import { asObj } from "./read";
import type { JudgeFit } from "./judgeFit";
import { parseJudgeFitV1 } from "./judgeFitV1";
import { parseJudgeFitV2 } from "./judgeFitV2";
import type { Parsed } from "./types";

export type { JudgeFit } from "./judgeFit";

export const JUDGE_FIT_SCHEMAS = ["judge-fit/v1", "judge-fit/v2"] as const;

export function parseJudgeFit(file: string, raw: unknown): Parsed<JudgeFit> {
  const o = asObj(raw);
  if (o === null) return { ok: false, file, problems: ["the file is not a JSON object"] };
  if (o["schema"] === "judge-fit/v2") return parseJudgeFitV2(file, o);
  if (o["schema"] === "judge-fit/v1") return parseJudgeFitV1(file, o);
  return { ok: false, file, problems: [`the schema is ${JSON.stringify(o["schema"] ?? null)}, expected one of ${JUDGE_FIT_SCHEMAS.join(", ")}`] };
}

/** Newest date first; on the same date a v2 report (held-out split) wins over v1; then by file name. */
export function newestFitFirst(a: JudgeFit, b: JudgeFit): number {
  return b.date.localeCompare(a.date) || (b.schema === "judge-fit/v2" ? 1 : 0) - (a.schema === "judge-fit/v2" ? 1 : 0) || b.file.localeCompare(a.file);
}
