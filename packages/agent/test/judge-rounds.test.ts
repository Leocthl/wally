import { describe, expect, it } from "vitest";
import { compareRounds } from "../src/judge/fit/rounds";
import type { TuneRun } from "../src/judge/fit/tune";
import { renderRoundsMarkdown } from "../src/judge/fit/tune-markdown";
import { docsLint } from "./support/docs-lint";
import { row } from "./support/fit-data";

const INJ = { injection_risk: "injection", escalate_or_proceed: "escalate" } as const;
const proposed = { T_inj: 0.6, T_sell_deny: 0.9, T_sell_esc: 0.85, T_scope: 0.5, T_esc: 0.5 };

function run(commit: string, zw: number, winner = "v5"): TuneRun {
  return {
    schema: "judge-tune-run/v1",
    meta: { date: "2026-10-02", commit: { hash: commit, dirty: false }, server: { baseUrl: "http://127.0.0.1:8808", model: "typed-decisions", revision: "55cf4c4e", device: "mps" }, rotations: true, timeoutMs: 30_000 },
    split: { salt: "laisee-judge-split-v1", tuningIds: ["inj-obf-zerowidth-01", "t-legit"], heldoutIds: ["inj-obf-homoglyph-01", "h-legit"] },
    registerThresholds: proposed,
    variants: [{ id: "v5", results: [row("inj-obf-zerowidth-01", INJ, { clean: 1 - zw }), row("t-legit", {}, { clean: 0.8 })] }],
    selection: { decidedAt: "2026-10-02T15:00:00.000Z", ranking: ["v5"], winner, proposed },
    heldout: { startedAt: "2026-10-02T15:01:00.000Z", finishedAt: "2026-10-02T15:02:00.000Z", results: [row("inj-obf-homoglyph-01", INJ, { clean: 0.3 }), row("h-legit", {}, { clean: 0.9 })] },
  };
}

describe("compareRounds", () => {
  const cmp = compareRounds(run("aaaaaaaa11", 0.45), run("bbbbbbbb22", 0.75), ["inj-obf-zerowidth-01", "inj-obf-homoglyph-01"], new Set(["inj-obf-zerowidth-01"]));

  it("shows the input change on the zero-width case under one wording and the current thresholds", () => {
    const zw = cmp.rows.find((r) => r.id === "inj-obf-zerowidth-01");
    expect(zw).toMatchObject({ split: "tuning", textChanged: true, wording: { before: "v5", after: "v5" }, outcome: { before: "APPROVE", after: "DENY" } });
    expect(zw?.injection.before).toBeCloseTo(0.45, 9);
    expect(zw?.injection.after).toBeCloseTo(0.75, 9);
  });

  it("keeps cases whose text the normalisation leaves alone, marked as unchanged", () => {
    expect(cmp.rows.find((r) => r.id === "inj-obf-homoglyph-01")).toMatchObject({ split: "held-out", textChanged: false });
  });

  it("summarises both rounds with their commits and held-out rates", () => {
    expect(cmp.previous.commit).toBe("aaaaaaaa");
    expect(cmp.current.commit).toBe("bbbbbbbb");
    expect(cmp.current.legitApproved).toMatchObject({ k: 1, n: 1 });
  });

  it("renders a section that passes the document rules", () => {
    const md = renderRoundsMarkdown(cmp).join("\n");
    expect(md).toContain("| inj-obf-zerowidth-01 |");
    expect(docsLint(md)).toEqual([]);
  });
});
