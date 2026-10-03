// Off-category item [F29] in the offline mock and Try asking: earbuds HK$399 from a clothes mandate stop at R6
// and the card never exists.
import { FakeClock } from "@wally/core/testing";
import { describe, expect, it } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import { m0SealRequest } from "../src/api/mock/presets";
import { TRY_ITEMS } from "../src/screens/home/tryCatalog";

describe("off_category", () => {
  it("is a Try asking card in the Stops group", () => {
    expect(TRY_ITEMS.find((p) => p.id === "off_category")).toMatchObject({ group: "stops" });
  });

  it("stops the earbuds at R6 in the mock, no card", async () => {
    const api = new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
    await api.seal(m0SealRequest(new Date()));
    const run = await api.runScenario("off_category");
    expect(run.outcome).toBe("DENY");
    const snap = await api.snapshot();
    const decision = snap.log.entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : [])).at(-1);
    expect(decision?.explanation?.template_id).toBe("R6.off_mandate");
    expect(decision?.cart.total_minor).toBe(39_900);
    expect(snap.cards).toHaveLength(0);
  });
});
