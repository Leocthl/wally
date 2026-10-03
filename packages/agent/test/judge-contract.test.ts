// Runs the shared JudgePort contract against every implementation: SystemOneJudge (laya and jev, through the
// mock server), ReplayJudge, and the ShadowJudge wrapper around each.
import { afterAll, beforeAll } from "vitest";
import type { JudgePort } from "@wally/core/ports";
import { MAX_RESPONSE_BYTES } from "../src/judge/config";
import { planRows } from "../src/judge/plan";
import { loadReplayRecordings } from "../src/judge/replay-recordings";
import { ReplayJudge } from "../src/judge/replay-judge";
import { ShadowJudge } from "../src/judge/shadow-judge";
import { SystemOneJudge } from "../src/judge/system-one-judge";
import { demoInput, inputWithText } from "./support/inputs";
import { describeJudgeContract, describeNeverThrows, type Scenario, type ScenarioSetup } from "./support/judge-contract";
import { startMockSystemOne, type MockBehavior, type MockSystemOne } from "./support/mock-system-one";
import { BASE_DISTRIBUTIONS, answerFor, wireResponse } from "./support/wire";

const TIMEOUT_MS = 2_000;
const SHORT_TIMEOUT_MS = 80;

function behaviorFor(scenario: Scenario): MockBehavior | null {
  const rows = planRows(true);
  const good = wireResponse(rows);
  switch (scenario) {
    case "ok":
    case "pre_aborted":
      return { kind: "ok" };
    case "timeout":
      return { kind: "hang" };
    case "http_500":
      return { kind: "http", status: 500 };
    case "malformed_json":
      return { kind: "raw", body: '{"answers": {"scope_fit__r0": ' };
    case "unknown_label":
      return { kind: "json", body: { ...good, answers: { ...good.answers, scope_fit__r0: answerFor({ in_scope: 0.5, maybe: 0.5 }) } } };
    case "bad_probabilities":
      return { kind: "json", body: { ...good, answers: { ...good.answers, seller_risk__r1: answerFor({ low_risk: 0.9, high_risk: 0.9 }) } } };
    case "truncated":
      return { kind: "ok", usage: { truncated: true, state_tokens_dropped: 891, truncated_questions: ["injection_risk__r0"] } };
    case "unreachable":
    case "unknown_input":
      return null;
  }
}

function networkSubject(provider: "laya" | "jev", shadow: boolean) {
  const servers: MockSystemOne[] = [];
  const subject = {
    name: `SystemOneJudge ${provider}${shadow ? " in a ShadowJudge" : ""}`,
    provider,
    shadow,
    required: ["ok", "timeout", "http_500", "malformed_json", "unknown_label", "bad_probabilities", "truncated", "unreachable", "pre_aborted"] as const,
    async setup(scenario: Scenario): Promise<ScenarioSetup | null> {
      if (scenario === "unknown_input") return null;
      const behavior = behaviorFor(scenario);
      const server = await startMockSystemOne(behavior ?? { kind: "ok" });
      servers.push(server);
      const baseUrl = scenario === "unreachable" ? await closedUrl(server) : server.baseUrl;
      const real = new SystemOneJudge({
        provider,
        baseUrl,
        model: provider === "jev" ? "jev-1.13.0" : "typed-decisions",
        ...(provider === "jev" ? { apiKey: "contract-test-key" } : {}),
      });
      const judge: JudgePort = shadow ? new ShadowJudge(real) : real;
      const controller = new AbortController();
      if (scenario === "pre_aborted") controller.abort();
      return {
        judge,
        input: demoInput("injected-tee"),
        timeoutMs: scenario === "timeout" ? SHORT_TIMEOUT_MS : TIMEOUT_MS,
        ...(scenario === "pre_aborted" ? { signal: controller.signal } : {}),
        cleanup: () => server.close(),
      };
    },
  };
  return subject;
}

async function closedUrl(server: MockSystemOne): Promise<string> {
  await server.close();
  return server.baseUrl;
}

describeJudgeContract(networkSubject("laya", false));
describeJudgeContract(networkSubject("jev", false));
describeJudgeContract(networkSubject("laya", true));

function replaySubject(shadow: boolean) {
  const recordings = loadReplayRecordings();
  return {
    name: `ReplayJudge${shadow ? " in a ShadowJudge" : ""}`,
    provider: "replay" as const,
    shadow,
    required: ["ok", "pre_aborted", "unknown_input"] as const,
    async setup(scenario: Scenario): Promise<ScenarioSetup | null> {
      const real = new ReplayJudge({ recordings });
      const judge: JudgePort = shadow ? new ShadowJudge(real) : real;
      const controller = new AbortController();
      if (scenario === "pre_aborted") controller.abort();
      switch (scenario) {
        case "ok":
          return { judge, input: demoInput("injected-tee"), timeoutMs: TIMEOUT_MS };
        case "pre_aborted":
          return { judge, input: demoInput("injected-tee"), timeoutMs: TIMEOUT_MS, signal: controller.signal };
        case "unknown_input":
          return { judge, input: inputWithText("Text nobody recorded an answer for."), timeoutMs: TIMEOUT_MS };
        default:
          return null;
      }
    },
  };
}

describeJudgeContract(replaySubject(false));
describeJudgeContract(replaySubject(true));

let shared: MockSystemOne;
beforeAll(async () => {
  shared = await startMockSystemOne({ kind: "ok" });
});
afterAll(async () => {
  await shared.close();
});

describeNeverThrows("SystemOneJudge laya with arbitrary listing text", async () => ({
  judge: new SystemOneJudge({ provider: "laya", baseUrl: shared.baseUrl, model: "typed-decisions" }),
  input: demoInput("apparel-tee"),
  timeoutMs: TIMEOUT_MS,
}));

describeNeverThrows("ReplayJudge with arbitrary listing text", async () => ({
  judge: new ReplayJudge({ recordings: loadReplayRecordings() }),
  input: demoInput("apparel-tee"),
  timeoutMs: TIMEOUT_MS,
}), 100);

void BASE_DISTRIBUTIONS;
void MAX_RESPONSE_BYTES;
