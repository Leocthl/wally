// Loads the recorded judge answers in data/fixtures/judge and keys each by the SHA-256 of the listing text it
// was recorded for (judge/<name>.json pairs with listings/<name>.json). Node only: it reads files.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JudgeRecord } from "@wally/core/ports";
import { formatIssues, validateJudgeRecord, validateListingRecord } from "@wally/core/schema";
import { isRecord } from "./guards";

export const DEFAULT_FIXTURES_DIR = fileURLToPath(new URL("../../../../data/fixtures/", import.meta.url));

export interface ReplayRecording {
  /** SHA-256 hex of the listing text the answers were recorded for. */
  readonly fingerprint: string;
  /** An OK record with answers. */
  readonly record: JudgeRecord;
  /** Path under the fixtures directory, for messages. */
  readonly source: string;
}

export class ReplayLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayLoadError";
  }
}

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

function readEnvelopeData(path: string, label: string): unknown {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ReplayLoadError(`${label}: cannot read (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!isRecord(raw) || !("data" in raw)) throw new ReplayLoadError(`${label}: not a fixture envelope`);
  return raw["data"];
}

/** Recorded versions are always labelled `recorded@...` so a log never mistakes a replay for a live call. */
const labelled = (version: string): string => (version.startsWith("recorded@") ? version : `recorded@${version}`);

function loadOne(dir: string, file: string): ReplayRecording {
  const name = basename(file, ".json");
  const source = `judge/${file}`;
  const record = validateJudgeRecord(readEnvelopeData(join(dir, source), source));
  if (!record.ok) throw new ReplayLoadError(`${source}: ${formatIssues(record.errors)}`);
  if (record.value.status !== "OK" || record.value.answers === undefined) throw new ReplayLoadError(`${source}: a recording must be an OK record with answers`);
  const listingPath = join(dir, "listings", file);
  if (!existsSync(listingPath)) throw new ReplayLoadError(`${source}: no listings/${name}.json to fingerprint`);
  const listing = validateListingRecord(readEnvelopeData(listingPath, `listings/${file}`));
  if (!listing.ok) throw new ReplayLoadError(`listings/${file}: ${formatIssues(listing.errors)}`);
  const stored: JudgeRecord = { ...record.value, provider: "replay", version: labelled(record.value.version) };
  return { fingerprint: sha256(listing.value.text), record: stored, source };
}

export function loadReplayRecordings(dir: string = DEFAULT_FIXTURES_DIR): readonly ReplayRecording[] {
  const judgeDir = join(dir, "judge");
  const files = existsSync(judgeDir) ? readdirSync(judgeDir).filter((f) => f.endsWith(".json")).sort() : [];
  if (files.length === 0) throw new ReplayLoadError(`no judge recordings in ${judgeDir}`);
  return files.map((file) => loadOne(dir, file));
}
