// From stored text to a restore plan, or a reason not to restore. Everything is checked before anything runs: the record is
// well formed and of this version, the keys are valid keys for their slots, the log is the log those keys signed (the whole
// hash chain, every signature, the seal by the pinned delegator, and the stored head), and the budget has not ended.
// Any failure means "start fresh"; a record is never half-trusted.
import { toJsonl } from "@wally/core/log";
import type { LogEntry } from "@wally/core/generated";
import { beforeAll, describe, expect, it } from "vitest";
import { newKeyMaterial, type KeyMaterial } from "../../src/api/local/persist/keys";
import { credentialIsFamily, planRestore } from "../../src/api/local/persist/plan";
import { decodeRecord, encodeRecord } from "../../src/api/local/persist/record";
import { recordText, sampleLog, sealRequest, START } from "./support";

let entries: readonly LogEntry[] = [];
let material: KeyMaterial;
let text = "";
let validUntil = "";

beforeAll(async () => {
  const sample = await sampleLog(async (client, clock) => {
    await client.seal(sealRequest(clock, 300));
    await client.runScenario("small");
    await client.runScenario("mint");
  });
  entries = sample.entries;
  material = sample.material;
  text = recordText(entries, material.files);
  validUntil = (entries[0]?.payload as { validUntil: string }).validUntil;
});

/** The valid record as an object, changed, as text. */
function changed(edit: (record: { log: string; head: unknown; keys: Record<string, unknown> }) => void): string {
  const decoded = decodeRecord(text);
  if (!decoded.ok) throw new Error("fixture record is not valid");
  const copy = structuredClone(decoded.record) as unknown as { log: string; head: unknown; keys: Record<string, unknown> };
  edit(copy);
  return JSON.stringify({ v: 1, savedAt: "2026-10-03T02:00:00.000Z", ...copy });
}

const lines = (): string[] => toJsonl(entries).split("\n").slice(0, -1);
const withLines = (edit: (all: string[]) => string[]): string => changed((r) => (r.log = `${edit(lines()).join("\n")}\n`));

describe("a valid stored session", () => {
  it("becomes a plan with the keys, the verified log, the seal to make again and the head", () => {
    const result = planRestore(text, START);
    expect(result.kind).toBe("plan");
    if (result.kind !== "plan") return;
    const { plan } = result;
    expect(plan.entries).toEqual(entries);
    expect(plan.keys.engine.did).toBe(material.keys.engine.did);
    expect(plan.keys.delegator.did).toBe(material.keys.delegator.did);
    expect(plan.files).toEqual(material.files);
    expect(plan.credential).toEqual(entries[0]?.payload);
    expect(plan.mandateId).toBe(`mnd_${(entries[0]?.log_id ?? "").slice(4)}`);
    expect(plan.head).toMatchObject({ log_id: entries[0]?.log_id, seq: entries.length - 1, entry_hash: entries.at(-1)?.entry_hash });
  });

  it("carries the seal request the credential was made from, so the seal can be made again", () => {
    const result = planRestore(text, START);
    if (result.kind !== "plan") throw new Error("expected a plan");
    const subject = (entries[0]?.payload as { credentialSubject: { intent_text: string; rules: unknown } }).credentialSubject;
    expect(result.plan.sealRequest).toEqual({ intentText: subject.intent_text, rules: subject.rules, validUntil });
  });

  it("is still good one second before the budget ends, and ended at the second it ends", () => {
    expect(planRestore(text, new Date(Date.parse(validUntil) - 1000)).kind).toBe("plan");
    expect(planRestore(text, new Date(validUntil))).toMatchObject({ kind: "ended", problem: "EXPIRED" });
    expect(planRestore(text, new Date(Date.parse(validUntil) + 86_400_000))).toMatchObject({ kind: "ended", problem: "EXPIRED" });
  });
});

describe("a record it will not restore", () => {
  it.each([
    ["not JSON", "{oops", "NOT_JSON"],
    ["another version", JSON.stringify({ v: 2 }), "VERSION"],
    ["not a record", "[]", "SHAPE"],
  ])("%s", (_name, bad, problem) => {
    expect(planRestore(bad, START)).toMatchObject({ kind: "ended", problem });
  });

  it("keys that are not valid keys for their slots", () => {
    const other = newKeyMaterial().files;
    expect(planRestore(changed((r) => (r.keys["engine"] = { ...other.engine, did: material.files.engine.did })), START)).toMatchObject({ kind: "ended", problem: "KEYS" });
    expect(planRestore(changed((r) => (r.keys["engine"] = other.delegator)), START)).toMatchObject({ kind: "ended", problem: "KEYS" });
    expect(planRestore(changed((r) => (r.keys["delegator"] = { ...material.files.engine, role: "delegator" })), START)).toMatchObject({ kind: "ended", problem: "KEYS" });
  });

  it("keys that are valid but did not sign this log (the chain does not verify with them)", () => {
    const other = newKeyMaterial().files;
    expect(planRestore(changed((r) => (r.keys["engine"] = other.engine)), START)).toMatchObject({ kind: "ended", problem: "CHAIN" });
    expect(planRestore(changed((r) => (r.keys["delegator"] = other.delegator)), START)).toMatchObject({ kind: "ended", problem: "CHAIN" });
  });

  it("a log line that is not JSON, or an empty line in the middle", () => {
    expect(planRestore(withLines((all) => [...all.slice(0, 2), "{broken", ...all.slice(2)]), START)).toMatchObject({ kind: "ended", problem: "LOG" });
    expect(planRestore(withLines((all) => [...all.slice(0, 2), "", ...all.slice(2)]), START)).toMatchObject({ kind: "ended", problem: "LOG" });
  });

  it("a log edited after it was signed: one amount changed", () => {
    const edited = withLines((all) => all.map((line, i) => (i === 1 ? line.replace(/"total_minor":(\d)/, (_m, d: string) => `"total_minor":${Number(d) === 9 ? 1 : Number(d) + 1}`) : line)));
    const result = planRestore(edited, START);
    expect(result).toMatchObject({ kind: "ended", problem: "CHAIN" });
    expect((result as { detail?: string }).detail).toMatch(/seq 1/);
  });

  it("a log with its entries reordered", () => {
    expect(planRestore(withLines((all) => [all[0] ?? "", all[2] ?? "", all[1] ?? "", ...all.slice(3)]), START)).toMatchObject({ kind: "ended", problem: "CHAIN" });
  });

  it("a log cut short while the stored head still names the last entry (truncation)", () => {
    expect(planRestore(withLines((all) => all.slice(0, -1)), START)).toMatchObject({ kind: "ended", problem: "CHAIN" });
  });

  it("a log with an entry added that the engine did not sign", () => {
    const forged = JSON.parse(lines().at(-1) ?? "{}") as Record<string, unknown>;
    forged["seq"] = entries.length;
    expect(planRestore(withLines((all) => [...all, JSON.stringify(forged)]), START)).toMatchObject({ kind: "ended", problem: "CHAIN" });
  });

  it("a head that is not where the log ends, or belongs to another log", () => {
    expect(planRestore(changed((r) => (r.head = { ...(r.head as object), seq: 1 })), START)).toMatchObject({ kind: "ended", problem: "CHAIN" });
    expect(planRestore(changed((r) => (r.head = { ...(r.head as object), log_id: "log_AnotherLogIdHere" })), START)).toMatchObject({ kind: "ended", problem: "CHAIN" });
  });

  it("a record whose size is over the cap is not even parsed", () => {
    expect(planRestore(" ".repeat(2_000_000), START)).toMatchObject({ kind: "ended", problem: "TOO_LARGE" });
  });

  it("never throws, whatever the text", () => {
    for (const bad of ["", "null", "0", '"x"', "{}", '{"v":1}', "\u0000", text.slice(0, 200), text + text]) {
      expect(() => planRestore(bad, START), bad.slice(0, 20)).not.toThrow();
    }
  });
});

describe("a family budget", () => {
  it("is recognised by the parent link in its credential", () => {
    expect(credentialIsFamily({ credentialSubject: { parent: { id: "x" } } } as never)).toBe(true);
    expect(credentialIsFamily({ credentialSubject: {} } as never)).toBe(false);
  });

  it("is not restored: Mum's key was never kept, so her ceiling could not be checked again (fail closed)", async () => {
    const family = await sampleLog(async (client, clock) => {
      await client.seal({ ...sealRequest(clock, 500), family: { parent: "mum" } });
    });
    const result = planRestore(recordText(family.entries, family.material.files), START);
    expect(result).toMatchObject({ kind: "ended", problem: "FAMILY" });
  });
});

describe("the encoder and the planner agree", () => {
  it("a record written with encodeRecord is read back by planRestore", () => {
    const written = encodeRecord({ savedAt: START, keys: material.files, log: toJsonl(entries), head: { log_id: entries[0]?.log_id ?? "", seq: entries.length - 1, entry_hash: entries.at(-1)?.entry_hash ?? "" } });
    expect(written.ok).toBe(true);
    if (written.ok) expect(planRestore(written.text, START).kind).toBe("plan");
  });
});
