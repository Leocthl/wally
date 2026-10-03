#!/usr/bin/env node
// Runs the invariant tests (T-I1 to T-I8, docs/10) across the workspace and prints one line per invariant.
// For the booth: "run the invariants" takes about half a minute and exits non-zero if any test fails.
// `node scripts/invariants.mjs --verbose` also prints every test line.
import { spawnSync } from "node:child_process";

const NAMES = {
  "T-I1": "Mint only after APPROVE for that cart; a repeat returns the same card",
  "T-I2": "Minted limit equals the approved total, within what is left and the card ceiling",
  "T-I3": "No judge output turns a stop into an approval",
  "T-I4": "The planner can only propose a cart; it holds no keys and no payment tool",
  "T-I5": "Any model, rail or log failure stops the purchase; no mint, no double charge",
  "T-I6": "No card after the budget is cancelled or has ended",
  "T-I7": "One signed log entry per decision; the chain verifies",
  "T-I8": "No card number or CVV in logs, fixtures or prompts",
};
const verbose = process.argv.includes("--verbose");
const run = spawnSync("pnpm", ["-r", "--no-bail", "exec", "vitest", "run", "-t", "T-I", "--reporter=verbose"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lines = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.split("\n").map((l) => l.trim()).filter((l) => /^(✓|×|✗)/.test(l) && /T-I[1-8]/.test(l));
const stats = Object.fromEntries(Object.keys(NAMES).map((id) => [id, { pass: 0, fail: 0 }]));
for (const line of lines) {
  const ok = line.startsWith("✓");
  if (verbose) console.log(line.replace(/\s+\d+ms$/, "").slice(0, 160));
  for (const id of new Set(line.match(/T-I[1-8]/g))) stats[id][ok ? "pass" : "fail"] += 1;
}
let bad = run.status !== 0 ? 1 : 0;
for (const [id, text] of Object.entries(NAMES)) {
  const { pass, fail } = stats[id];
  const mark = fail > 0 || pass === 0 ? "FAIL" : "PASS";
  if (mark === "FAIL") bad += 1;
  console.log(`${mark}  ${id}  ${text}  (${pass} tests)`);
}
process.exit(bad > 0 ? 1 : 0);
