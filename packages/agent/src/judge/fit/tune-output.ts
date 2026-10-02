// Writes the three B-20 deliverables from a judge:tune run: judge-fit-<date>.json and .md and
// judge-thresholds-proposal.json. The checkpoint revision comes from services/laya/MODEL_REVISION (the pin).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAnchors } from "./anchors";
import { loadMandate } from "./fit-env";
import { buildProposal } from "./proposal";
import type { TuneRun } from "./tune";
import { renderTuneMarkdown } from "./tune-markdown";
import { buildTuneReport } from "./tune-report";

export const MODEL_REVISION_PATH = fileURLToPath(new URL("../../../../../services/laya/MODEL_REVISION", import.meta.url));

/** The demo listings' recorded answers as data/fixtures/judge holds them now (after judge:record, the new ones). */
export function refreshRecorded(run: TuneRun): TuneRun {
  const current = loadAnchors(loadMandate());
  return { ...run, anchors: (run.anchors ?? []).map((a) => ({ ...a, recorded: current.find((c) => c.name === a.name)?.recorded ?? null })) };
}

export function writeTuneOutputs(run: TuneRun, outDir: string, now: () => Date = () => new Date()): readonly string[] {
  const report = buildTuneReport(run);
  const pinned = readFileSync(MODEL_REVISION_PATH, "utf8").trim();
  const live = report.meta.server.revision;
  if (live !== null && !pinned.startsWith(live)) throw new Error(`server checkpoint ${live} is not the pinned revision ${pinned}`);
  mkdirSync(outDir, { recursive: true });
  const files: readonly (readonly [string, string])[] = [
    [join(outDir, `judge-fit-${run.meta.date}.json`), `${JSON.stringify(report, null, 2)}\n`],
    [join(outDir, `judge-fit-${run.meta.date}.md`), renderTuneMarkdown(report)],
    [join(outDir, "judge-thresholds-proposal.json"), `${JSON.stringify(buildProposal(report, { generatedAt: now().toISOString(), modelRevision: pinned }), null, 2)}\n`],
  ];
  for (const [path, text] of files) writeFileSync(path, text);
  return files.map(([path]) => path);
}
