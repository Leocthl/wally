// Audit (lane s-audit): judge adapter configuration. With no JUDGE_MODE (and in .env.example) the mode is
// shadow, so every record carries shadow: true and the engine skips R10, including the fail-closed
// R10.unavailable (see packages/core/test/security-judge-shadow.test.ts). Also: secrets in diagnostics.
import { describe, expect, it } from "vitest";
import { createJudgeFromEnv, parseJudgeEnv } from "../src/judge/create-judge";
import type { JudgeDiagnostic } from "../src/judge/diagnostics";
import { SystemOneJudge } from "../src/judge/system-one-judge";
import { inputWithText } from "./support/inputs";

const DEFAULT_ENV = parseJudgeEnv({});
const DOWN_RECORD = await createJudgeFromEnv({}, {
  fetchImpl: () => {
    throw new Error("connection refused");
  },
}).assess(inputWithText("Soft cotton tee."), { timeoutMs: 500 });

async function diagnosticsFor(opts: { provider: "laya" | "jev"; baseUrl: string; apiKey?: string }) {
  const seen: JudgeDiagnostic[] = [];
  const judge = new SystemOneJudge({ ...opts, model: "typed-decisions", onDiagnostic: (d) => seen.push(d) });
  await judge.assess(inputWithText("Soft cotton tee."), { timeoutMs: 2_000 });
  return seen.map((d) => JSON.stringify(d)).join("\n");
}

const USERINFO_DIAG = await diagnosticsFor({ provider: "laya", baseUrl: "http://audit:hunter2@127.0.0.1:9" });
const KEY_DIAG = await diagnosticsFor({ provider: "jev", baseUrl: "https://127.0.0.1:9", apiKey: "tsk_live_AUDITSECRET\nX" });

describe("setup", () => {
  it("the default env parses and a failing judge produces an ERROR record", () => {
    expect(DEFAULT_ENV.ok).toBe(true);
    expect(DOWN_RECORD.status).toBe("ERROR");
    expect(USERINFO_DIAG.length).toBeGreaterThan(0);
    expect(KEY_DIAG.length).toBeGreaterThan(0);
  });
});

describe("KNOWN DEFECT S-JUDGE-2: the judge defaults to shadow mode (no effect, not even fail closed)", () => {
  it.fails("with no JUDGE_MODE the adapter enforces", () => {
    expect(DEFAULT_ENV.ok && DEFAULT_ENV.settings.mode).toBe("enforce");
  });

  it.fails("a judge that cannot be reached yields a record the engine must act on (shadow: false)", () => {
    expect(DOWN_RECORD.shadow).toBe(false);
  });
});

describe("KNOWN DEFECT S-JUDGE-3: secrets reach judge diagnostics through fetch error messages", () => {
  it.fails("userinfo in LAYA_BASE_URL is refused and never echoed", () => {
    expect(USERINFO_DIAG).not.toContain("hunter2"); // today: "Request cannot be constructed from a URL that includes credentials: http://audit:hunter2@..."
    expect(parseJudgeEnv({ JUDGE_PROVIDER: "laya", LAYA_BASE_URL: "http://audit:hunter2@127.0.0.1:8808" }).ok).toBe(false);
  });

  it.fails("an API key with a line break is refused and never echoed", () => {
    expect(KEY_DIAG).not.toContain("AUDITSECRET");
  });
});
