// Run metadata: seed, git commit, checkpoint revision, device, run time (UTC+8). Read through an injected reader so tests
// pin every field and no result depends on the machine that ran the tests.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

export interface RunMeta {
  readonly commit: string;
  /** Uncommitted changes outside data/results: the commit then does not describe the code that ran. */
  readonly dirty: boolean;
  readonly checkpointRevision: string;
  readonly device: string;
}

export interface MetaReader {
  read(): RunMeta;
}

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

function git(args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

export function repoMetaReader(layaDevice: string | null): MetaReader {
  return {
    read(): RunMeta {
      const cpu = os.cpus()[0]?.model ?? "unknown cpu";
      const memGb = Math.round(os.totalmem() / 1024 ** 3);
      return {
        commit: git(["rev-parse", "HEAD"]),
        dirty: git(["status", "--porcelain", "--", ".", ":(exclude)data/results"]).length > 0,
        checkpointRevision: readFileSync(`${REPO_ROOT}services/laya/MODEL_REVISION`, "utf8").trim(),
        device: `${cpu}, ${memGb} GB${layaDevice === null ? "" : `, ${layaDevice}`}`,
      };
    },
  };
}

/** RFC 3339 with the +08:00 offset, the zone the capture protocol records. */
export function formatHkt(at: Date): string {
  const shifted = new Date(at.getTime() + 8 * 3_600_000);
  return `${shifted.toISOString().slice(0, 19)}+08:00`;
}
