// Validates data/scenarios/booth.json: one entry per ScenarioId (request text, listing ids, the replay record, how the
// run goes, the expected outcome and template). A bad table is a start-up error, never a silent default. The host
// reads the file (Node: server/booth/scenarioTable.ts; browser: the bundled JSON) and hands the parsed value here.
import { SCENARIO_IDS, type CardBeat, type RunOutcome, type ScenarioId } from "../../api/types";

/** Checkout beats a scenario can ask for, each with the SIMULATED merchant-stub mode it runs under. */
export const BEAT_MODES = {
  exact: "honest",
  overshoot: "overshoot",
  replay: "honest",
  wrong_merchant: "wrong_merchant",
  retry: "timeout",
  drift: "drift",
} as const satisfies Readonly<Record<string, string>>;
export type ScenarioBeat = keyof typeof BEAT_MODES;

export interface DerivedListing {
  readonly id: string;
  readonly base: string;
  readonly url: string;
  readonly merchant?: { readonly name: string; readonly domain: string };
  readonly seller?: string;
  readonly scameterRef?: string;
}

export interface ScenarioExpect {
  readonly outcome: RunOutcome;
  readonly templateId: string | null;
  /** Card events in order: "AUTHORISED", "VOIDED" or "DECLINED:<code>". */
  readonly events: readonly string[];
  /** The run summary's stable code (a refused seal: EXCEEDS_PARENT), when the scenario ends in one. */
  readonly code: string | null;
}

/** A family scenario seals Mei's budget under Mum's ceiling before it does anything else (see OrchestratorBackend). */
export interface ScenarioFamily {
  /** What Mei seals under Mum's ceiling, integer minor units. */
  readonly sealMinor: number;
}

/**
 * "See cheaper options" after a stop from this button: a planner shown only the button's own listing has nothing cheaper to
 * pick, so the replan runs over these listings with this request (the recorded cheaper pick was made for the pair). The pick
 * is a proposal like any other: the cart builder, the judge and rules R1 to R12 decide it.
 */
export interface ScenarioCheaper {
  readonly request: string;
  readonly listings: readonly string[];
}

export interface ScenarioEntry {
  readonly id: ScenarioId;
  readonly label: string;
  readonly dm: string;
  readonly request: string;
  readonly listings: readonly string[];
  readonly plannerReplay: string;
  /**
   * buy: submit the listings, then the beats on the new card. card: use the newest card in `card` state (buy one first if
   * none). seal: only the family seal, nothing is bought (it needs `family`).
   */
  readonly run: "buy" | "card" | "seal";
  /** Set: the scenario opens by sealing this much under Mum's budget; a refused seal ends the run there. */
  readonly family: ScenarioFamily | null;
  readonly card: "ACTIVE" | "USED" | null;
  readonly beats: readonly ScenarioBeat[];
  /** Price the listing so its total is just over what is left (F22 shape), when the stored one would fit. */
  readonly overflow: boolean;
  /** Where "See cheaper options" looks after this button's R3 or R4 stop; null: over the button's own listings. */
  readonly cheaper: ScenarioCheaper | null;
  readonly note: string | null;
  readonly expect: ScenarioExpect;
}

export interface CustomEntry {
  readonly request: string;
  readonly listings: readonly string[];
  readonly plannerReplay: string;
}

export interface ScenarioTable {
  readonly derivedListings: readonly DerivedListing[];
  readonly custom: CustomEntry;
  readonly scenarios: Readonly<Record<ScenarioId, ScenarioEntry>>;
}

export class ScenarioTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioTableError";
  }
}

type Obj = Readonly<Record<string, unknown>>;
const OUTCOMES: readonly RunOutcome[] = ["APPROVE", "DENY", "ESCALATE", "INFO", "ERROR"];
const BEATS = Object.keys(BEAT_MODES) as readonly ScenarioBeat[];

function obj(value: unknown, where: string): Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ScenarioTableError(`${where} must be an object`);
  return value as Obj;
}

function str(o: Obj, key: string, where: string): string {
  const value = o[key];
  if (typeof value !== "string" || value.trim() === "") throw new ScenarioTableError(`${where}.${key} must be a non-empty string`);
  return value;
}

function optStr(o: Obj, key: string, where: string): string | null {
  return o[key] === undefined || o[key] === null ? null : str(o, key, where);
}

function strList(o: Obj, key: string, where: string, allowEmpty: boolean): readonly string[] {
  const value = o[key];
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((v) => typeof v !== "string")) {
    throw new ScenarioTableError(`${where}.${key} must be a list of strings`);
  }
  return value as readonly string[];
}

function parseExpect(raw: unknown, where: string): ScenarioExpect {
  const o = obj(raw, `${where}.expect`);
  const outcome = OUTCOMES.find((x) => x === o["outcome"]);
  if (outcome === undefined) throw new ScenarioTableError(`${where}.expect.outcome must be one of ${OUTCOMES.join(", ")}`);
  return { outcome, templateId: optStr(o, "templateId", `${where}.expect`), events: strList(o, "events", `${where}.expect`, true), code: optStr(o, "code", `${where}.expect`) };
}

function parseFamily(o: Obj, where: string): ScenarioFamily | null {
  if (o["family"] === undefined || o["family"] === null) return null;
  const sealMinor = obj(o["family"], `${where}.family`)["sealMinor"];
  if (typeof sealMinor !== "number" || !Number.isSafeInteger(sealMinor) || sealMinor <= 0) {
    throw new ScenarioTableError(`${where}.family.sealMinor must be a positive whole number of minor units`);
  }
  return { sealMinor };
}

function parseCheaper(o: Obj, where: string): ScenarioCheaper | null {
  if (o["cheaper"] === undefined || o["cheaper"] === null) return null;
  const cheaper = obj(o["cheaper"], `${where}.cheaper`);
  return { request: str(cheaper, "request", `${where}.cheaper`), listings: strList(cheaper, "listings", `${where}.cheaper`, false) };
}

function parseScenario(id: ScenarioId, raw: unknown): ScenarioEntry {
  const where = `scenarios.${id}`;
  const o = obj(raw, where);
  const run = o["run"];
  if (run !== "buy" && run !== "card" && run !== "seal") throw new ScenarioTableError(`${where}.run must be buy, card or seal`);
  const family = parseFamily(o, where);
  if (run === "seal" && family === null) throw new ScenarioTableError(`${where}.run seal needs a family`);
  if (run === "card" && family !== null) throw new ScenarioTableError(`${where}.family cannot go with a card run`);
  const card = o["card"] ?? null;
  if (run === "card" ? card !== "ACTIVE" && card !== "USED" : card !== null) throw new ScenarioTableError(`${where}.card must be ACTIVE or USED for a card run, absent otherwise`);
  const beats = strList(o, "beats", where, true).map((b) => {
    const beat = BEATS.find((x) => x === b);
    if (beat === undefined) throw new ScenarioTableError(`${where}.beats: unknown beat ${b}`);
    return beat;
  });
  return {
    id,
    label: str(o, "label", where),
    dm: str(o, "dm", where),
    request: str(o, "request", where),
    listings: strList(o, "listings", where, false),
    plannerReplay: str(o, "plannerReplay", where),
    run,
    family,
    card: card as ScenarioEntry["card"],
    beats,
    overflow: o["overflow"] === true,
    cheaper: parseCheaper(o, where),
    note: optStr(o, "note", where),
    expect: parseExpect(o["expect"], where),
  };
}

function parseDerived(raw: unknown, index: number): DerivedListing {
  const where = `derivedListings[${index}]`;
  const o = obj(raw, where);
  const merchant = o["merchant"] === undefined ? undefined : obj(o["merchant"], `${where}.merchant`);
  return {
    id: str(o, "id", where),
    base: str(o, "base", where),
    url: str(o, "url", where),
    ...(merchant === undefined ? {} : { merchant: { name: str(merchant, "name", `${where}.merchant`), domain: str(merchant, "domain", `${where}.merchant`) } }),
    ...(o["seller"] === undefined ? {} : { seller: str(o, "seller", where) }),
    ...(o["scameterRef"] === undefined ? {} : { scameterRef: str(o, "scameterRef", where) }),
  };
}

export function parseScenarioTable(raw: unknown): ScenarioTable {
  const root = obj(raw, "booth.json");
  if (root["provenance"] !== "SIMULATED") throw new ScenarioTableError("booth.json provenance must be SIMULATED");
  const scenarios = obj(root["scenarios"], "scenarios");
  const unknown = Object.keys(scenarios).filter((k) => !SCENARIO_IDS.some((id) => id === k));
  if (unknown.length > 0) throw new ScenarioTableError(`scenarios: unknown id(s) ${unknown.join(", ")}`);
  const entries = SCENARIO_IDS.map((id) => {
    if (!(id in scenarios)) throw new ScenarioTableError(`scenarios.${id} is missing`);
    return [id, parseScenario(id, scenarios[id])] as const;
  });
  const derived = root["derivedListings"];
  if (!Array.isArray(derived)) throw new ScenarioTableError("derivedListings must be a list");
  const custom = obj(root["custom"], "custom");
  return {
    derivedListings: derived.map(parseDerived),
    custom: { request: str(custom, "request", "custom"), listings: strList(custom, "listings", "custom", false), plannerReplay: str(custom, "plannerReplay", "custom") },
    scenarios: Object.fromEntries(entries) as Record<ScenarioId, ScenarioEntry>,
  };
}

/** The UI's card beat for a scenario beat (the timeout beat shows as a retry). */
export function cardBeatOf(beat: ScenarioBeat): CardBeat {
  return beat === "drift" ? "void" : beat;
}
