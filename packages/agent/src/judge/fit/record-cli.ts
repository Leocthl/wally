// judge:record command line (B-10). Run with: pnpm --filter @wally/agent judge:record
// Re-records data/fixtures/judge/*.json from the running local Laya server with the shipped wording.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DEFAULT_LAYA_BASE_URL, DEFAULT_LAYA_MODEL } from "../config";
import { SHIPPED_WORDING_VARIANT } from "../questions";
import { ServerUnreachableError, readHealth } from "./fit-env";
import { recordFixtures } from "./record-fixtures";
import { MODEL_REVISION_PATH } from "./tune-output";
import { variantById } from "./variants";

/** Tooling timeout for the recording calls; the product limit is F34 and comes from the caller. */
const RECORD_TIMEOUT_MS = 30_000;
const out = (text: string): void => void process.stdout.write(`${text}\n`);
const err = (text: string): void => void process.stderr.write(`${text}\n`);
const hkDate = (): string => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { "base-url": { type: "string" }, variant: { type: "string" }, date: { type: "string" } } });
  const baseUrl = values["base-url"] ?? process.env["LAYA_BASE_URL"] ?? DEFAULT_LAYA_BASE_URL;
  const model = process.env["LAYA_MODEL"] ?? DEFAULT_LAYA_MODEL;
  const pinned = readFileSync(MODEL_REVISION_PATH, "utf8").trim();
  const health = await readHealth(baseUrl, model);
  if (health === null) return (err(new ServerUnreachableError(baseUrl).message), 2);
  if (health.revision === null || !pinned.startsWith(health.revision)) return (err(`server checkpoint ${health.revision ?? "unknown"} is not the pinned ${pinned}`), 1);
  const variantId = values.variant ?? SHIPPED_WORDING_VARIANT;
  try {
    const written = await recordFixtures({ baseUrl, model, date: values.date ?? hkDate(), timeoutMs: RECORD_TIMEOUT_MS, variantId, questions: variantById(variantId).questions, modelRevision: pinned });
    for (const w of written) out(`wrote ${w.path}`);
    return 0;
  } catch (e) {
    err(`judge:record failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

process.exitCode = await main();
