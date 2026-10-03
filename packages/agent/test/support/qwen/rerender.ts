// Re-renders an evaluation report from its JSON after the run, optionally dropping one model's hijack records
// (for example when that server was stopped mid-run) and adding run notes. Not a test: run it by hand.
//   pnpm --filter @wally/agent exec tsx test/support/qwen/rerender.ts <base path without extension> [--drop-hijack 4b] [--note "..."]
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { renderMarkdown, type EvalReport } from "./eval-report";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { "drop-hijack": { type: "string", default: "" }, note: { type: "string", multiple: true, default: [] } } });
const base = positionals[0] ?? "";
const report = JSON.parse(readFileSync(`${base}.json`, "utf8")) as EvalReport;
const next: EvalReport = {
  ...report,
  hijack: report.hijack.filter((h) => h.model !== values["drop-hijack"]),
  notes: [...(report.notes ?? []), ...(values.note ?? [])],
};
writeFileSync(`${base}.json`, `${JSON.stringify(next, null, 2)}\n`);
writeFileSync(`${base}.md`, renderMarkdown(next));
process.stdout.write(`rewrote ${base}.json and .md\n`);
