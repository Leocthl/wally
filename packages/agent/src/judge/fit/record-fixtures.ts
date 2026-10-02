// judge:record (B-10): re-records data/fixtures/judge/<name>.json from the live Laya server for every listing in
// data/fixtures/listings, with the given wording and the demo cart and Scameter state. Raw probabilities only:
// R10 applies the thresholds, so a recording stays valid when the thresholds change. All calls run before any file
// is written, and any failed call writes nothing: a recording is always an OK answer.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JudgeRecord } from "@laisee/core/ports";
import { DEFAULT_FIXTURES_DIR } from "../replay-recordings";
import { SystemOneJudge } from "../system-one-judge";
import { loadAnchors } from "./anchors";
import { loadMandate } from "./fit-env";
import type { QuestionDefs } from "./variants";

export interface RecordOptions {
  readonly baseUrl: string;
  readonly model: string;
  readonly date: string;
  readonly timeoutMs: number;
  readonly variantId: string;
  readonly questions: QuestionDefs;
  /** Full pinned checkpoint commit (services/laya/MODEL_REVISION), written into each note. */
  readonly modelRevision: string;
  readonly fixturesDir?: string | undefined;
}

export interface Recorded {
  readonly name: string;
  readonly path: string;
  readonly record: JudgeRecord;
}

function envelope(name: string, record: JudgeRecord, o: RecordOptions): unknown {
  return {
    fixture: `judge/${name}`,
    provenance: "SIMULATED",
    schema: "judge-record",
    note: `Recorded from live Laya on ${o.date} (model ${o.model}, checkpoint revision ${o.modelRevision}, wording ${o.variantId}, option-order rotations averaged) for the SIMULATED listing listings/${name}. MEASURED(1) raw probabilities on a SIMULATED listing; R10 applies the thresholds. Served by the replay provider.`,
    data: {
      provider: "replay",
      model: record.model,
      version: `recorded@${record.version}`,
      status: "OK",
      latency_ms: Math.round(record.latency_ms),
      shadow: false,
      answers: record.answers,
    },
  };
}

export async function recordFixtures(o: RecordOptions): Promise<readonly Recorded[]> {
  const dir = o.fixturesDir ?? DEFAULT_FIXTURES_DIR;
  const judge = new SystemOneJudge({ provider: "laya", baseUrl: o.baseUrl, model: o.model, rotations: true, questions: o.questions });
  const recorded: Recorded[] = [];
  for (const a of loadAnchors(loadMandate(), dir)) {
    const record = await judge.assess(a.input, { timeoutMs: o.timeoutMs });
    if (record.status !== "OK" || record.answers === undefined) throw new Error(`${a.name}: ${record.status}${record.input_truncated === true ? " (truncated)" : ""}; nothing written`);
    recorded.push({ name: a.name, path: join(dir, "judge", `${a.name}.json`), record });
  }
  for (const r of recorded) writeFileSync(r.path, `${JSON.stringify(envelope(r.name, r.record, o), null, 2)}\n`);
  return recorded;
}
