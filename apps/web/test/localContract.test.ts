// The on-device client against the shared ApiClient contract: the same tests the mock and the HTTP client pass, here
// on the real orchestrator, engine, cart builder, executor, signed log and verifier running in this process, with
// recorded planner and judge answers and a seeded SIMULATED rail.
import { seededRandom } from "@laisee/rail-sim";
import { afterEach } from "vitest";
import { LocalApiClient } from "../src/api/local/LocalApiClient";
import { apiClientContract } from "./apiClientContract";

const open: LocalApiClient[] = [];

afterEach(() => {
  for (const client of open.splice(0)) client.dispose();
});

apiClientContract("LocalApiClient (on-device, real stack)", async () => {
  const client = new LocalApiClient({ railRandom: () => seededRandom(7), tickMs: null });
  open.push(client);
  return { client, dispose: () => client.dispose() };
});
