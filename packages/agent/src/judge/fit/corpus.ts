// Loader and validator for data/judge-corpus/*.json: SIMULATED labelled cases in the listing-record shape.
// Labels are the author's (single annotator). Everything the fit reports about accuracy is MEASURED(n) on these.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JudgeAnswers, ListingRecord } from "@laisee/core/generated";
import { formatIssues, validateListingRecord } from "@laisee/core/schema";
import { isRecord } from "../guards";
import type { ScameterState } from "./inputs";

export const DEFAULT_CORPUS_DIR = fileURLToPath(new URL("../../../../../data/judge-corpus/", import.meta.url));

export const CORPUS_CATEGORIES = [
  "clean_apparel",
  "unusual_shipping",
  "injected_description",
  "injected_review",
  "injected_polite",
  "injected_obfuscated",
  "negation_trap",
  "padding_attack",
  "off_category",
  "risky_seller",
  "mixed",
] as const;
export type CorpusCategory = (typeof CORPUS_CATEGORIES)[number];

export interface CorpusLabels {
  readonly scope_fit: keyof JudgeAnswers["scope_fit"];
  readonly injection_risk: keyof JudgeAnswers["injection_risk"];
  readonly seller_risk: keyof JudgeAnswers["seller_risk"];
  readonly escalate_or_proceed: keyof JudgeAnswers["escalate_or_proceed"];
}

export interface CorpusCase {
  readonly id: string;
  readonly category: CorpusCategory;
  readonly labels: CorpusLabels;
  readonly scameter_state: ScameterState;
  readonly notes: string;
  readonly listing: ListingRecord;
}

export class CorpusError extends Error {
  constructor(source: string, problem: string) {
    super(`judge corpus ${source}: ${problem}`);
    this.name = "CorpusError";
  }
}

const SCAMETER_STATES: readonly ScameterState[] = ["FLAGGED", "NO_RECORD", "NOT_CHECKED"];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,60}$/;

/** The label the corpus uses for escalate_or_proceed: any reason to stop means escalate. */
export function deriveEscalateLabel(l: Pick<CorpusLabels, "scope_fit" | "injection_risk" | "seller_risk">): "proceed" | "escalate" {
  return l.scope_fit === "out_of_scope" || l.injection_risk !== "clean" || l.seller_risk === "high_risk" ? "escalate" : "proceed";
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function parseLabels(raw: unknown, where: string, source: string): CorpusLabels {
  if (!isRecord(raw)) throw new CorpusError(source, `${where}: labels is not an object`);
  const { scope_fit: s, injection_risk: i, seller_risk: r, escalate_or_proceed: e } = raw;
  if (!oneOf(s, ["in_scope", "out_of_scope"] as const)) throw new CorpusError(source, `${where}: bad scope_fit label`);
  if (!oneOf(i, ["clean", "suspicious", "injection"] as const)) throw new CorpusError(source, `${where}: bad injection_risk label`);
  if (!oneOf(r, ["low_risk", "high_risk"] as const)) throw new CorpusError(source, `${where}: bad seller_risk label`);
  if (!oneOf(e, ["proceed", "escalate"] as const)) throw new CorpusError(source, `${where}: bad escalate_or_proceed label`);
  const labels: CorpusLabels = { scope_fit: s, injection_risk: i, seller_risk: r, escalate_or_proceed: e };
  if (deriveEscalateLabel(labels) !== e) throw new CorpusError(source, `${where}: escalate_or_proceed does not follow from the other labels`);
  return labels;
}

function parseCase(raw: unknown, index: number, source: string): CorpusCase {
  const where = `case ${index}`;
  if (!isRecord(raw)) throw new CorpusError(source, `${where}: not an object`);
  const { id, category, scameter_state: scameter, notes, listing } = raw;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new CorpusError(source, `${where}: bad id`);
  if (!oneOf(category, CORPUS_CATEGORIES)) throw new CorpusError(source, `${id}: unknown category`);
  if (!oneOf(scameter, SCAMETER_STATES)) throw new CorpusError(source, `${id}: bad scameter_state`);
  const checked = validateListingRecord(listing);
  if (!checked.ok) throw new CorpusError(source, `${id}: ${formatIssues(checked.errors)}`);
  return {
    id,
    category,
    labels: parseLabels(raw["labels"], id, source),
    scameter_state: scameter,
    notes: typeof notes === "string" ? notes : "",
    listing: checked.value,
  };
}

export function parseCorpusFile(raw: unknown, source: string): readonly CorpusCase[] {
  if (!isRecord(raw)) throw new CorpusError(source, "not an object");
  if (raw["provenance"] !== "SIMULATED") throw new CorpusError(source, "provenance must be SIMULATED");
  const cases = raw["cases"];
  if (!Array.isArray(cases) || cases.length === 0) throw new CorpusError(source, "no cases");
  return cases.map((c, i) => parseCase(c, i, source));
}

export function loadCorpus(dir: string = DEFAULT_CORPUS_DIR): readonly CorpusCase[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new CorpusError(dir, "no corpus files");
  const all = files.flatMap((file) => parseCorpusFile(JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown, file));
  const seen = new Set<string>();
  for (const c of all) {
    if (seen.has(c.id)) throw new CorpusError(dir, `duplicate case id ${c.id}`);
    seen.add(c.id);
  }
  return all;
}
