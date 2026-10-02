// scripts/verify-log.mjs and scripts/keys-gen.mjs, run as child processes against temp dirs. They load the
// TypeScript sources through Node type stripping; on a Node without it these tests skip themselves.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parseKeyFile } from "../src/crypto";
import { toJsonl } from "../src/log";
import { parsePublicKeys } from "../src/verify";
import { buildLog, demoSteps, type DemoKeys } from "./log-helpers";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const GOLDEN = fileURLToPath(new URL("./golden/", import.meta.url));
const CAN_RUN = typeof nodeModule.registerHooks === "function" && Boolean(process.features.typescript);
const tmp = mkdtempSync(join(tmpdir(), "laisee-cli-"));
/** Each case starts Node processes that load the TypeScript sources; slow on a loaded machine. */
const CLI_TIMEOUT = { timeout: 60_000 };

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function run(script: string, args: readonly string[]) {
  const result = spawnSync(process.execPath, [join(ROOT, "scripts", script), ...args], { cwd: ROOT, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const golden = (name: string) => join(GOLDEN, name);

describe.skipIf(!CAN_RUN)("verify-log CLI", CLI_TIMEOUT, () => {
  it("prints PASS and exits 0 for the golden log, with and without its checkpoint", () => {
    const withCp = run("verify-log.mjs", [golden("demo-log.jsonl"), golden("demo-public-keys.json"), golden("demo-checkpoint.json")]);
    expect(withCp).toMatchObject({ code: 0, stderr: "" });
    expect(withCp.stdout).toMatch(/^PASS log_demoM0 seq 0\.\.9 head [0-9a-f]{64}, checkpoint seq 9 matches\n$/);
    expect(run("verify-log.mjs", [golden("demo-log.jsonl"), golden("demo-public-keys.json")]).code).toBe(0);
  });

  it("prints the first failing seq and reason and exits 1 after a byte flip or a truncation", () => {
    const text = readFileSync(golden("demo-log.jsonl"), "utf8");
    const flipped = join(tmp, "flipped.jsonl");
    writeFileSync(flipped, text.replace('"amount_minor":25900', '"amount_minor":25800'));
    const result = run("verify-log.mjs", [flipped, golden("demo-public-keys.json")]);
    const target = text.split("\n").findIndex((line) => line.includes('"amount_minor":25900'));
    expect(target).toBeGreaterThan(0);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(new RegExp(`^FAIL seq ${target} PAYLOAD_HASH: `));
    const cut = join(tmp, "cut.jsonl");
    writeFileSync(cut, text.split("\n").slice(0, 6).join("\n") + "\n");
    const truncated = run("verify-log.mjs", [cut, golden("demo-public-keys.json"), golden("demo-checkpoint.json")]);
    expect(truncated.code).toBe(1);
    expect(truncated.stdout).toMatch(/^FAIL seq 6 TRUNCATED: /);
  });

  it("exits 1 with a message on bad arguments or bad key files", () => {
    expect(run("verify-log.mjs", [])).toMatchObject({ code: 1 });
    const badKeys = join(tmp, "bad-keys.json");
    writeFileSync(badKeys, JSON.stringify({ engine: [], delegator: "x" }));
    const result = run("verify-log.mjs", [golden("demo-log.jsonl"), badKeys]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("public keys");
  });
});

describe.skipIf(!CAN_RUN)("keys-gen CLI", CLI_TIMEOUT, () => {
  const keyDir = join(tmp, "keys");
  const publicFile = join(tmp, "public-keys.json");
  const args = ["--key-dir", keyDir, "--public", publicFile];

  it("writes 600 secret files in a 700 directory and a public-only key file", () => {
    const result = run("keys-gen.mjs", args);
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(statSync(keyDir).mode & 0o777).toBe(0o700);
    const pub = JSON.parse(readFileSync(publicFile, "utf8")) as unknown;
    expect(parsePublicKeys(pub).ok).toBe(true);
    for (const role of ["engine", "delegator"] as const) {
      const path = join(keyDir, `${role}.json`);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      const file = JSON.parse(readFileSync(path, "utf8")) as { secret_key: string };
      const signer = parseKeyFile(file, role);
      expect(JSON.stringify(pub)).toContain(signer.did);
      for (const output of [result.stdout, result.stderr, readFileSync(publicFile, "utf8")]) expect(output).not.toContain(file.secret_key);
    }
  });

  it("refuses to overwrite keys without --force and replaces them with it", () => {
    const before = readFileSync(join(keyDir, "engine.json"), "utf8");
    expect(run("keys-gen.mjs", args).code).toBe(1);
    expect(readFileSync(join(keyDir, "engine.json"), "utf8")).toBe(before);
    expect(run("keys-gen.mjs", [...args, "--force"]).code).toBe(0);
    expect(readFileSync(join(keyDir, "engine.json"), "utf8")).not.toBe(before);
    expect(statSync(join(keyDir, "engine.json")).mode & 0o777).toBe(0o600);
  });

  it("produces keys that sign a log verify-log accepts", async () => {
    const read = (role: "engine" | "delegator") => parseKeyFile(JSON.parse(readFileSync(join(keyDir, `${role}.json`), "utf8")), role);
    const pub = JSON.parse(readFileSync(publicFile, "utf8")) as { engine: string[]; delegator: string; agent: string };
    const keys: DemoKeys = {
      engine: read("engine"),
      delegator: read("delegator"),
      agentDid: pub.agent,
      publicKeys: { engine: pub.engine, delegator: pub.delegator },
    };
    const log = await buildLog(demoSteps(keys), keys);
    const logFile = join(tmp, "generated.jsonl");
    writeFileSync(logFile, toJsonl(log.entries));
    expect(run("verify-log.mjs", [logFile, publicFile]).stdout).toMatch(/^PASS /);
  });
});
