// Golden demo log (SIMULATED, test-only keys derived from public labels) committed under test/golden for
// other lanes: the verifier page tests (T-V1) and T-E2E can read these files without signing code.
// Regenerate after an intended format change: UPDATE_GOLDEN=1 pnpm vitest run --project core verify-golden
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toJsonl } from "../src/log";
import { verifyLogText } from "../src/verify";
import { buildDemoLog } from "./log-helpers";

const DIR = fileURLToPath(new URL("./golden/", import.meta.url));
const demo = await buildDemoLog();

const files: Record<string, string> = {
  "demo-log.jsonl": toJsonl(demo.entries),
  "demo-public-keys.json": `${JSON.stringify(
    {
      note: "SIMULATED golden demo log keys for tests only (derived from public labels in packages/core/test). Not the booth keys.",
      engine: demo.keys.publicKeys.engine,
      delegator: demo.keys.publicKeys.delegator,
      agent: demo.keys.agentDid,
    },
    null,
    2,
  )}\n`,
  "demo-checkpoint.json": `${JSON.stringify(demo.checkpoint, null, 2)}\n`,
};

describe("golden demo log", () => {
  it.each(Object.keys(files))("%s matches the code that writes it", (name) => {
    if (process.env["UPDATE_GOLDEN"] === "1") writeFileSync(join(DIR, name), files[name] ?? "");
    expect(readFileSync(join(DIR, name), "utf8")).toBe(files[name]);
  });

  it("verifies with its keys and checkpoint", () => {
    const keys = JSON.parse(readFileSync(join(DIR, "demo-public-keys.json"), "utf8")) as { engine: string[]; delegator: string };
    const checkpoint = JSON.parse(readFileSync(join(DIR, "demo-checkpoint.json"), "utf8")) as typeof demo.checkpoint;
    expect(verifyLogText(readFileSync(join(DIR, "demo-log.jsonl"), "utf8"), keys, checkpoint)).toEqual({ ok: true, head: checkpoint });
  });
});
