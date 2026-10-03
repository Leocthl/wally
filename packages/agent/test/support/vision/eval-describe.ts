// Evaluation of the photo reader against the running Qwen server and a folder of labelled product photos. Not a test:
// run it by hand (macOS: it re-encodes with sips the way the page does with a canvas).
//
//   pnpm --filter @wally/agent exec tsx test/support/vision/eval-describe.ts \
//     --photos /path/to/demo-photos --out ../../data/results/vision-describe-2026-10-03
//
// The photos folder holds the pictures and a labels.json (kept out of git with the pictures). The report keeps only
// aggregates and anonymised rows: no file names, no brand names, no product names.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createChatClient } from "../../../src/planner/local";
import { describeImage, type Described } from "../../../src/vision/describe";
import { extractPalette, type PaletteEntry } from "../../../src/vision/palette";
import { decodePng } from "./png";

const { values: args } = parseArgs({
  options: {
    photos: { type: "string", default: "/Users/leo/csProj/hacku-hackathon/data/raw/demo-photos" },
    "base-url": { type: "string", default: "http://127.0.0.1:8809" },
    model: { type: "string", default: "qwen3.5-9b-q4km" },
    out: { type: "string", default: "" },
    warmup: { type: "string", default: "2" },
    "palette-only": { type: "boolean", default: false },
    note: { type: "string", multiple: true, default: [] },
  },
});

interface Label {
  readonly file: string;
  readonly kind: string;
  readonly kindAlt: readonly string[];
  readonly visible: readonly string[];
  readonly colour: string;
  readonly colourAlt: readonly string[];
  readonly pattern: string;
}

export interface Row {
  readonly n: number;
  readonly expectedKind: string;
  readonly expectedColor: string;
  readonly kind: string | null;
  readonly colors: readonly string[];
  readonly pattern: string | null;
  readonly kindOk: boolean;
  readonly kindLenientOk: boolean;
  readonly colorFirstExact: boolean;
  readonly colorFirstOk: boolean;
  readonly colorInList: boolean;
  readonly paletteTop: readonly PaletteEntry[];
  readonly paletteFirstOk: boolean;
  readonly paletteInTwo: boolean;
  readonly reason: string;
  readonly latencyMs: number | null;
}

const labels = (JSON.parse(readFileSync(join(args.photos, "labels.json"), "utf8")) as { labels: Label[] }).labels;
const client = createChatClient({ baseUrl: args["base-url"] });
const load1 = (): number => Math.round((os.loadavg()[0] ?? 0) * 100) / 100;
const pct = (count: number, total: number): string => `${count}/${total} (${(count / total).toFixed(2)})`;

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (rank - lo);
}

/** Long edge 1024 px, JPEG quality 85: what the page sends. Also a PNG of the same pixels for the palette. */
function prepare(file: string, dir: string): { readonly jpeg: Uint8Array; readonly png: Uint8Array } {
  const jpg = join(dir, "page.jpg");
  const png = join(dir, "page.png");
  execFileSync("sips", ["-Z", "1024", "--setProperty", "format", "jpeg", "--setProperty", "formatOptions", "85", join(args.photos, file), "--out", jpg], { stdio: "ignore" });
  execFileSync("sips", ["-s", "format", "png", jpg, "--out", png], { stdio: "ignore" });
  return { jpeg: readFileSync(jpg), png: readFileSync(png) };
}

function serverFacts(): { readonly build: string; readonly vision: boolean; readonly tokens: string; readonly cacheRam: string; readonly footprintMb: number | null } {
  try {
    const props = execFileSync("curl", ["-s", "--max-time", "3", `${args["base-url"]}/props`], { encoding: "utf8" });
    const json = JSON.parse(props) as { build_info?: string; modalities?: { vision?: boolean } };
    const pid = execFileSync("lsof", ["-nP", "-tiTCP:8809", "-sTCP:LISTEN"], { encoding: "utf8" }).trim().split("\n")[0] ?? "";
    const command = pid === "" ? "" : execFileSync("ps", ["-p", pid, "-o", "command="], { encoding: "utf8" });
    const foot = pid === "" ? "" : execFileSync("footprint", ["-p", pid], { encoding: "utf8" });
    const mb = /phys_footprint:\s*([\d.]+)\s*MB/.exec(foot)?.[1];
    return {
      build: json.build_info ?? "unknown",
      vision: json.modalities?.vision === true,
      tokens: /--image-max-tokens\s+(\d+)/.exec(command)?.[1] ?? "default",
      cacheRam: /--cache-ram\s+(\d+)/.exec(command)?.[1] ?? "default",
      footprintMb: mb === undefined ? null : Number(mb),
    };
  } catch {
    return { build: "unknown", vision: false, tokens: "unknown", cacheRam: "unknown", footprintMb: null };
  }
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(os.tmpdir(), "wally-vision-eval-"));
  const rows: Row[] = [];
  const loads: number[] = [];
  const started = new Date().toISOString();
  try {
    const before = serverFacts();
    if (!args["palette-only"]) {
      const warm = prepare(labels[0]?.file ?? "", dir).jpeg;
      for (let i = 0; i < Number.parseInt(args.warmup, 10); i += 1) await describeImage(warm, { client, model: args.model });
    }
    for (const [index, label] of labels.entries()) {
      const { jpeg, png } = prepare(label.file, dir);
      const palette = extractPalette(decodePng(png));
      const accepted = [label.colour, ...label.colourAlt];
      const described: Described | null = args["palette-only"] ? null : await describeImage(jpeg, { client, model: args.model });
      loads.push(load1());
      const kind = described?.attributes?.kind ?? null;
      const colors = described?.attributes?.colors ?? [];
      const kindOk = kind !== null && (kind === label.kind || label.kindAlt.includes(kind));
      rows.push({
        n: index + 1,
        expectedKind: label.kind,
        expectedColor: label.colour,
        kind,
        colors,
        pattern: described?.attributes?.pattern ?? null,
        kindOk,
        kindLenientOk: kindOk || (kind !== null && label.visible.includes(kind)),
        colorFirstExact: colors[0] === label.colour,
        colorFirstOk: colors[0] !== undefined && accepted.includes(colors[0]),
        colorInList: colors.some((c) => accepted.includes(c)),
        paletteTop: palette,
        paletteFirstOk: palette[0] !== undefined && accepted.includes(palette[0].color),
        paletteInTwo: palette.slice(0, 2).some((e) => accepted.includes(e.color)),
        reason: described?.reason ?? "palette_only",
        latencyMs: described === null ? null : described.latencyMs,
      });
      process.stdout.write(`${String(index + 1).padStart(2)} ${label.kind.padEnd(9)} -> ${String(kind).padEnd(9)} ${kindOk ? "ok " : "MISS"} | ${label.colour.padEnd(10)} -> ${colors.join("+").padEnd(22)} | palette ${palette.map((e) => `${e.color}:${e.share}`).join(" ")} | ${described?.latencyMs ?? "-"} ms\n`);
    }
    const after = serverFacts();
    const n = rows.length;
    const count = (pick: (r: Row) => boolean): number => rows.filter(pick).length;
    const latencies = rows.flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs])).sort((a, b) => a - b);
    const summary = {
      n,
      started,
      finished: new Date().toISOString(),
      host: `${os.cpus()[0]?.model ?? "unknown"} ${Math.round(os.totalmem() / 2 ** 30)} GB`,
      server: { build: after.build, vision: after.vision, imageMaxTokens: after.tokens, cacheRam: after.cacheRam, footprintMbBefore: before.footprintMb, footprintMbAfter: after.footprintMb },
      loadAverage1: { min: Math.min(...loads), max: Math.max(...loads) },
      model: {
        validAnswers: count((r) => r.kind !== null),
        kindStrict: count((r) => r.kindOk),
        kindLenient: count((r) => r.kindLenientOk),
        colorFirstExact: count((r) => r.colorFirstExact),
        colorFirstAccepted: count((r) => r.colorFirstOk),
        colorInList: count((r) => r.colorInList),
        latencyMs: { p50: Math.round(percentile(latencies, 50)), p95: Math.round(percentile(latencies, 95)), max: latencies.at(-1) ?? null, min: latencies[0] ?? null },
      },
      palette: { firstAccepted: count((r) => r.paletteFirstOk), inFirstTwo: count((r) => r.paletteInTwo) },
      notes: args.note,
    };
    process.stdout.write(`\n${JSON.stringify(summary, null, 2)}\n`);
    if (args.out !== "") {
      writeFileSync(`${args.out}.json`, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
      writeFileSync(`${args.out}.md`, renderMarkdown(summary, rows));
      process.stdout.write(`wrote ${args.out}.json and ${args.out}.md\n`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function renderMarkdown(s: Record<string, unknown>, rows: readonly Row[]): string {
  const sum = s as unknown as {
    n: number;
    started: string;
    finished: string;
    host: string;
    server: { build: string; vision: boolean; imageMaxTokens: string; cacheRam: string; footprintMbBefore: number | null; footprintMbAfter: number | null };
    loadAverage1: { min: number; max: number };
    model: { validAnswers: number; kindStrict: number; kindLenient: number; colorFirstExact: number; colorFirstAccepted: number; colorInList: number; latencyMs: { p50: number; p95: number; max: number | null; min: number | null } };
    palette: { firstAccepted: number; inFirstTwo: number };
    notes: string[];
  };
  const n = sum.n;
  const lines = [
    "# Photo reader evaluation 2026-10-03",
    "",
    `- **Status**: MEASURED(n=${n}) on ${n} Hong Kong retailer product photos (model shots and flat lays), one annotator. Tuned on the same ${n} photos (prompt wording, a legend of the kind words, the picture token budget): there is no held-out set, so treat the rates as an upper bound.`,
    `- **Run**: ${sum.started} to ${sum.finished}; host ${sum.host}; llama.cpp ${sum.server.build}; one request at a time after 2 warm-up calls; --image-max-tokens ${sum.server.imageMaxTokens}, --cache-ram ${sum.server.cacheRam}.`,
    "- **Input**: each photo re-encoded the way the page does it (long edge 1024 px, JPEG quality 85, metadata dropped) and sent through `describeImage` (grammar of fixed words, 15 s limit, temperature 0, seed 42). The photos stay on the booth Mac and are not in the repository; this file holds no file names, brand names or product names.",
    "- **Labels**: written before any tuning, kept next to the photos. Kind = the garment the product page names (accepted synonyms for that one item, for example jeans or trousers for cargo pants). Colour = the main colour of that garment as seen (a few close words accepted where two are fair). Outfit shots show other garments too: the lenient kind rate also accepts a clearly visible large garment.",
    `- **Machine load**: 1-minute load average ${sum.loadAverage1.min} to ${sum.loadAverage1.max} during the run (other work shares the machine).`,
    "",
    "## Results",
    "| Metric | Value |",
    "| --- | --- |",
    `| Valid answers | ${pct(sum.model.validAnswers, n)} |`,
    `| Kind correct (the product's garment) | ${pct(sum.model.kindStrict, n)} |`,
    `| Kind correct, any clearly visible garment | ${pct(sum.model.kindLenient, n)} |`,
    `| Main colour: first colour exact | ${pct(sum.model.colorFirstExact, n)} |`,
    `| Main colour: first colour exact or an accepted close word | ${pct(sum.model.colorFirstAccepted, n)} |`,
    `| Main colour anywhere in the answer's list | ${pct(sum.model.colorInList, n)} |`,
    `| Latency p50 / p95 / max, ms | ${sum.model.latencyMs.p50} / ${sum.model.latencyMs.p95} / ${sum.model.latencyMs.max} (n=${n}) |`,
    `| Colour plates only (no model): main colour first, accepted word | ${pct(sum.palette.firstAccepted, n)} |`,
    `| Colour plates only: main colour within the first two | ${pct(sum.palette.inFirstTwo, n)} |`,
    `| Server memory (physical footprint), before / after the run | ${sum.server.footprintMbBefore ?? "?"} MB / ${sum.server.footprintMbAfter ?? "?"} MB |`,
    ...(sum.notes.length === 0 ? [] : ["", ...sum.notes.map((note) => `- **Note**: ${note}`)]),
    "",
    "## Per photo (anonymised)",
    "| # | Expected kind | Kind read | Ok | Expected colour | Colours read | Ok | Plates first | Ok | ms |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.n} | ${r.expectedKind} | ${r.kind ?? "none"} | ${r.kindOk ? "yes" : r.kindLenientOk ? "other garment" : "no"} | ${r.expectedColor} | ${r.colors.join(", ") || "none"} | ${r.colorFirstOk ? "yes" : "no"} | ${r.paletteTop[0]?.color ?? "none"} | ${r.paletteFirstOk ? "yes" : "no"} | ${r.latencyMs ?? "-"} |`),
    "",
  ];
  return lines.join("\n");
}

await main();
