// Test double: the offline MockApiClient (which passes apiClientContract) behind the BoothBackend interface, so the
// HTTP, SSE and client layers can be tested without the orchestrator. Never used outside tests.
import { FakeClock } from "@wally/core/testing";
import { MockApiClient } from "../../../src/api/MockApiClient";
import type { BoothBackend } from "../../../server/backend";

export function mockBackend(): { readonly backend: BoothBackend; readonly mock: MockApiClient } {
  const mock = new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  const backend: BoothBackend = {
    info: () => mock.info(),
    snapshot: () => mock.snapshot(),
    seal: (req) => mock.seal(req),
    runScenario: (id) => mock.runScenario(id),
    propose: (req) => mock.propose(req),
    revoke: (req) => mock.revoke(req),
    answerEscalation: (req) => mock.answerEscalation(req),
    ask: () => Promise.reject(new Error("the mock does not ask")),
    suggestAlternatives: () => Promise.reject(new Error("the mock has no cheaper options")),
    compileRules: (req) => mock.compileRules(req),
    see: () => Promise.reject(new Error("the mock does not see")),
    getLog: () => mock.getLog(),
    verify: () => mock.verify(),
    tamper: () => mock.tamper(),
    restore: () => mock.restore(),
    reset: () => mock.reset(),
    exportLog: async () => ({
      log: "",
      publicKeys: { note: "test double", engine: [], delegator: "", agent: "" },
      checkpoint: null,
    }),
    family: () => Promise.reject(new Error("the mock has no family budget")),
    subscribe: (listener) => mock.subscribe(listener),
  };
  return { backend, mock };
}
