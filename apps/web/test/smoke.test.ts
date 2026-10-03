import { describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { RAIL_BADGE } from "../src/labels";

describe("@wally/web scaffold", () => {
  it("serves /api/health without a network socket", async () => {
    const res = await createApp().request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rail: "SIMULATED" });
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await createApp().request("/api/nope");
    expect(res.status).toBe(404);
  });

  it("labels the rail SIMULATED", () => {
    expect(RAIL_BADGE).toBe("SIMULATED");
  });
});
