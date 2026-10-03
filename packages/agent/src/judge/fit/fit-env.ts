// Shared environment helpers for the judge tools (judge:fit, judge:tune, judge:record): server health, git state
// and the demo mandate. Reads only; never starts, stops or changes the server.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Mandate } from "@wally/core/generated";
import { formatIssues, validateMandate } from "@wally/core/schema";
import { DEFAULT_FIXTURES_DIR } from "../replay-recordings";
import type { FitMeta } from "./report";

const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

export interface Health {
  readonly revision: string | null;
  readonly device: string | null;
}

export async function readHealth(baseUrl: string, model: string): Promise<Health | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { revisions?: Record<string, string>; checkpoint_devices?: Record<string, string>; device?: string };
    return { revision: body.revisions?.[model]?.slice(0, 8) ?? null, device: body.checkpoint_devices?.[model] ?? body.device ?? null };
  } catch {
    return null;
  }
}

export function gitInfo(): FitMeta["commit"] {
  try {
    const run = (...args: string[]): string => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    // Untracked files (the report being written) do not make the code dirty.
    return { hash: run("rev-parse", "HEAD"), dirty: run("status", "--porcelain", "--untracked-files=no").length > 0 };
  } catch {
    return null;
  }
}

export function loadMandate(): Mandate {
  const raw = JSON.parse(readFileSync(join(DEFAULT_FIXTURES_DIR, "mandate/m0.json"), "utf8")) as { data: unknown };
  const checked = validateMandate(raw.data);
  if (!checked.ok) throw new Error(`mandate/m0.json: ${formatIssues(checked.errors)}`);
  return checked.value;
}

export class ServerUnreachableError extends Error {
  constructor(baseUrl: string) {
    super(`no judge server answered at ${baseUrl}/health; start services/laya/serve.sh first`);
    this.name = "ServerUnreachableError";
  }
}
