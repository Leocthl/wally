import { describe, expect, it } from "vitest";
import { statusLine } from "../src/status";

describe("@laisee/verifier scaffold", () => {
  it("renders pass and fail lines", () => {
    expect(statusLine({ ok: true, head: { log_id: "log_demoM0", seq: 4, entry_hash: "0".repeat(64) } })).toContain("PASS");
    expect(statusLine({ ok: false, failedSeq: 2, reason: "PREV_HASH" })).toBe("FAIL at seq 2: PREV_HASH");
  });
});
