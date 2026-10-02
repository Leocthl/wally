// Timeline statuses: tick before the first failure, cross on it, "not checked" after; the checkpoint row says
// whether the head checkpoint matched, did not match (TRUNCATED) or was never reached.
import { describe, expect, it } from "vitest";
import { renderTimeline } from "../src/render/timeline";
import { runVerification, type RunResult } from "../src/run";
import { CHECKPOINT, joinLines, KEYS, LINES, LOG } from "./helpers";

const statuses = (result: RunResult): readonly string[] => (result.kind === "checked" ? result.timeline.rows.map((r) => r.status) : []);
const checkpointOf = (result: RunResult): string => (result.kind === "checked" ? result.timeline.checkpoint : "n/a");
const ok = (n: number): readonly string[] => Array.from({ length: n }, () => "ok");

describe("timeline statuses", () => {
  it("PASS: every row verified and the checkpoint matches", () => {
    const result = runVerification({ log: LOG, keys: KEYS, checkpoint: CHECKPOINT });
    expect(statuses(result)).toEqual(ok(10));
    expect(checkpointOf(result)).toBe("ok");
  });

  it("a log cut short: every present row verified, the checkpoint row does not match", () => {
    const result = runVerification({ log: joinLines(LINES.slice(0, 6)), keys: KEYS, checkpoint: CHECKPOINT });
    expect(statuses(result)).toEqual(ok(6));
    expect(checkpointOf(result)).toBe("broken");
  });

  it("a checkpoint whose hash differs at its seq marks that entry broken (rewritten)", () => {
    const at4 = JSON.parse(LINES[4] ?? "{}") as { entry_hash: string };
    const checkpoint = JSON.stringify({ log_id: "log_demoM0", seq: 3, entry_hash: at4.entry_hash });
    const result = runVerification({ log: LOG, keys: KEYS, checkpoint });
    expect(result.kind === "checked" && result.report).toMatchObject({ ok: false, failedSeq: 3, reason: "TRUNCATED" });
    expect(statuses(result)).toEqual([...ok(3), "broken", ...Array.from({ length: 6 }, () => "unchecked")]);
    expect(checkpointOf(result)).toBe("broken");
  });

  it("a checkpoint for another log leaves the entries verified and fails the checkpoint row", () => {
    const checkpoint = JSON.stringify({ ...JSON.parse(CHECKPOINT), log_id: "log_otherLog1", seq: 0 });
    const result = runVerification({ log: LOG, keys: KEYS, checkpoint });
    expect(statuses(result)).toEqual(ok(10));
    expect(checkpointOf(result)).toBe("broken");
  });

  it("a chain break before the end leaves the checkpoint not checked", () => {
    const result = runVerification({ log: LOG.replace('"approved_limit_minor":25900', '"approved_limit_minor":25901'), keys: KEYS, checkpoint: CHECKPOINT });
    expect(statuses(result).slice(0, 3)).toEqual(["ok", "broken", "unchecked"]);
    expect(checkpointOf(result)).toBe("unchecked");
  });

  it("labels unreadable lines and cuts long kinds", () => {
    const longKind = JSON.stringify({ kind: "K".repeat(200), seq: 0 });
    const result = runVerification({ log: `${longKind}\nnot json\n`, keys: KEYS, checkpoint: "" });
    const rows = result.kind === "checked" ? result.timeline.rows : [];
    expect(rows[0]?.kind.length).toBeLessThanOrEqual(40);
    expect(rows[0]?.kind.endsWith("…")).toBe(true);
    expect(rows[1]).toMatchObject({ seq: "?", kind: "unreadable line" });
  });
});

describe("long logs", () => {
  it("draw a window that always includes the first failure", () => {
    const base = runVerification({ log: LOG, keys: KEYS, checkpoint: "" });
    if (base.kind !== "checked") throw new Error("expected a checked result");
    const rows = Array.from({ length: 1000 }, (_, i) => ({ index: i, seq: String(i), kind: "DECISION", ts: "", status: i < 900 ? "ok" : i === 900 ? "broken" : "unchecked" }) as const);
    const big: RunResult = { ...base, timeline: { rows, checkpoint: "none" } };
    const node = renderTimeline(big, null);
    const drawn = [...node.querySelectorAll(".row")];
    expect(drawn.length).toBe(400);
    expect(node.querySelector('.row[data-index="900"]')?.getAttribute("data-status")).toBe("broken");
    expect(node.textContent).toMatch(/\d+ earlier entries not shown/);
  });
});
