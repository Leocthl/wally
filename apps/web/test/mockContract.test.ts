import { FakeClock } from "@wally/core/testing";
import { MockApiClient } from "../src/api/MockApiClient";
import { apiClientContract } from "./apiClientContract";

apiClientContract("MockApiClient", async () => ({
  client: new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 }),
}));
