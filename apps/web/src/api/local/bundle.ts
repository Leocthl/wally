// Everything on-device mode replays, bundled at build time (no fs, no network): the booth scenario table, the
// SIMULATED catalogue (listings, reference cart, Scameter captures), the planner replay records and the recorded judge
// answers. Each file passes the same validation as on the server when the bundle loads; a bad file throws.
import { parseReplayFile } from "@wally/agent/planner";
import type { ReplayRecording } from "@wally/agent/judge";
import type { PlannerReplayRecord } from "@wally/core/generated";
import referenceCart from "@fixtures/carts/attempt-1.json";
import boothTable from "../../../../../data/scenarios/booth.json";
import type { FixtureText } from "../../booth/backend/ask";
import { buildCatalogue, type Catalogue, type FixtureFile } from "../../booth/backend/catalogue";
import { parseScenarioTable, type ScenarioTable } from "../../booth/backend/scenarioTable";
import { judgeRecordingsFrom } from "./recordings";

const LISTINGS = import.meta.glob<unknown>("@fixtures/listings/*.json", { eager: true, import: "default" });
const CAPTURES = import.meta.glob<unknown>("@fixtures/scameter/*.json", { eager: true, import: "default" });
const JUDGE = import.meta.glob<unknown>("@fixtures/judge/*.json", { eager: true, import: "default" });
const PLANNER_FIXTURES = import.meta.glob<string>("@fixtures/planner/*.json", { eager: true, query: "?raw", import: "default" });
const PLANNER_SCENARIOS = import.meta.glob<string>("../../../../../data/scenarios/planner/*.json", { eager: true, query: "?raw", import: "default" });

export interface LocalBundle {
  readonly table: ScenarioTable;
  readonly catalogue: Catalogue;
  readonly plannerRecords: readonly PlannerReplayRecord[];
  /** The planner files as text, for the sample requests written in their notes (ask.ts recordedRequests). */
  readonly plannerTexts: readonly FixtureText[];
  readonly judgeRecordings: readonly ReplayRecording[];
}

const fileName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** Files of one glob sorted by name, as the Node loaders read a directory. */
function sorted<T>(files: Readonly<Record<string, T>>): readonly (readonly [string, T])[] {
  return Object.entries(files)
    .map(([path, value]) => [fileName(path), value] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const fixtureFiles = (dir: string, files: Readonly<Record<string, unknown>>): readonly FixtureFile[] =>
  sorted(files).map(([name, raw]) => ({ name: `${dir}/${name}`, raw }));

/** Fixtures first, then the booth's own records; a scenario id may appear once (as loadReplayRecords checks per dir). */
function plannerRecords(): readonly PlannerReplayRecord[] {
  const parse = (files: Readonly<Record<string, string>>): readonly PlannerReplayRecord[] => {
    const records = sorted(files).map(([name, text]) => parseReplayFile(name, text));
    const repeated = records.find((r, i) => records.findIndex((o) => o.scenario === r.scenario) !== i);
    if (repeated !== undefined) throw new Error(`planner fixtures: scenario ${repeated.scenario} appears twice`);
    return records;
  };
  return [...parse(PLANNER_FIXTURES), ...parse(PLANNER_SCENARIOS)];
}

/** Validates and assembles the bundle. Throws on any bad file (fail closed: no half-loaded demo). */
export function loadBundle(): LocalBundle {
  const table = parseScenarioTable(boothTable);
  const catalogue = buildCatalogue(
    {
      listings: fixtureFiles("listings", LISTINGS),
      referenceCart: { name: "carts/attempt-1.json", raw: referenceCart },
      captures: fixtureFiles("scameter", CAPTURES),
    },
    table,
  );
  const plannerTexts = [...sorted(PLANNER_FIXTURES), ...sorted(PLANNER_SCENARIOS)].map(([name, text]) => ({ name, text }));
  return { table, catalogue, plannerRecords: plannerRecords(), plannerTexts, judgeRecordings: judgeRecordingsFrom(JUDGE, LISTINGS) };
}
