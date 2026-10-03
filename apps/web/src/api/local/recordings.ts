// Recorded judge answers for on-device mode, from the bundled fixture files (no fs). Same checks and the same result
// as @wally/agent's loadReplayRecordings on disk (a test compares them): judge/<name>.json must be an OK record with
// answers, paired with listings/<name>.json, keyed by the SHA-256 of that listing's text, version labelled recorded@.
// Any bad file is a load error: the page fails loudly instead of replaying a wrong answer.
import type { ReplayRecording } from "@wally/agent/judge";
import { sha256Hex } from "@wally/core/crypto";
import type { JudgeRecord } from "@wally/core/ports";
import { formatIssues, validateJudgeRecord, validateListingRecord } from "@wally/core/schema";
import type { Shop } from "../../booth/backend/shop";

export class RecordingLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordingLoadError";
  }
}

/** Parsed JSON files by path (import.meta.glob keys); only the file name is used. */
export type BundledFiles = Readonly<Record<string, unknown>>;

const fileName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

function envelopeData(raw: unknown, label: string): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !("data" in raw)) throw new RecordingLoadError(`${label}: not a fixture envelope`);
  return (raw as { readonly data: unknown }).data;
}

/** Recorded versions are always labelled `recorded@...` so a log never mistakes a replay for a live call. */
const labelled = (version: string): string => (version.startsWith("recorded@") ? version : `recorded@${version}`);

function recordingOf(file: string, raw: unknown, listingsByFile: ReadonlyMap<string, unknown>): ReplayRecording {
  const source = `judge/${file}`;
  const record = validateJudgeRecord(envelopeData(raw, source));
  if (!record.ok) throw new RecordingLoadError(`${source}: ${formatIssues(record.errors)}`);
  if (record.value.status !== "OK" || record.value.answers === undefined) throw new RecordingLoadError(`${source}: a recording must be an OK record with answers`);
  if (!listingsByFile.has(file)) throw new RecordingLoadError(`${source}: no listings/${file} to fingerprint`);
  const listing = validateListingRecord(envelopeData(listingsByFile.get(file), `listings/${file}`));
  if (!listing.ok) throw new RecordingLoadError(`listings/${file}: ${formatIssues(listing.errors)}`);
  const stored: JudgeRecord = { ...record.value, provider: "replay", version: labelled(record.value.version) };
  return { fingerprint: sha256Hex(listing.value.text), record: stored, source };
}

/** Every judge recording, sorted by file name like the disk loader. */
export function judgeRecordingsFrom(judgeFiles: BundledFiles, listingFiles: BundledFiles): readonly ReplayRecording[] {
  const judge = Object.entries(judgeFiles)
    .map(([path, raw]) => [fileName(path), raw] as const)
    .filter(([file]) => file.endsWith(".json"))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (judge.length === 0) throw new RecordingLoadError("no judge recordings in the bundle");
  const listings = new Map(Object.entries(listingFiles).map(([path, raw]) => [fileName(path), raw] as const));
  return judge.map(([file, raw]) => recordingOf(file, raw, listings));
}

/**
 * Judge answers for the photo shelf (data/photo-shelf/judge.json), recorded from live Laya by scripts/record-shop-judge.ts.
 * One record per shelf item, keyed by the SHA-256 of that item's listing text; a record made for other text is a load error
 * (re-record), so an edited listing can never be judged by a stale answer. A shelf item with no record is a load error too.
 */
export function shopRecordingsFrom(file: unknown, shop: Shop): readonly ReplayRecording[] {
  const source = "shop/judge.json";
  if (file === null || typeof file !== "object" || (file as { provenance?: unknown }).provenance !== "SIMULATED" || (file as { schema?: unknown }).schema !== "photo-shelf-judge") {
    throw new RecordingLoadError(`${source}: not a SIMULATED photo-shelf-judge fixture`);
  }
  const rows = (envelopeData(file, source) as { records?: unknown }).records;
  if (!Array.isArray(rows)) throw new RecordingLoadError(`${source}: records must be a list`);
  const recordings = rows.map((row, index): ReplayRecording => {
    const where = `${source} record ${index}`;
    if (row === null || typeof row !== "object" || Array.isArray(row)) throw new RecordingLoadError(`${where}: not an object`);
    const entry = row as { listing?: unknown; text_sha256?: unknown; record?: unknown };
    const item = typeof entry.listing === "string" ? shop.get(entry.listing) : undefined;
    if (item === undefined) throw new RecordingLoadError(`${where}: no such photo-shelf item`);
    const fingerprint = sha256Hex(item.listing.text);
    if (entry.text_sha256 !== fingerprint) throw new RecordingLoadError(`${where}: recorded for other text than ${item.item.id} has now; run scripts/record-shop-judge.ts`);
    const record = validateJudgeRecord(entry.record);
    if (!record.ok) throw new RecordingLoadError(`${where}: ${formatIssues(record.errors)}`);
    if (record.value.status !== "OK" || record.value.answers === undefined) throw new RecordingLoadError(`${where}: a recording must be an OK record with answers`);
    return { fingerprint, record: { ...record.value, provider: "replay", version: labelled(record.value.version) }, source: `${source}#${item.item.id}` };
  });
  const missing = [...shop.keys()].filter((id) => !recordings.some((r) => r.source.endsWith(`#${id}`)));
  if (missing.length > 0) throw new RecordingLoadError(`${source}: no judge answer for ${missing.join(", ")}`);
  return recordings;
}
