// T-I8: no PAN-like digit run or CVV field can pass the schemas into the log, and key material never
// appears in any serialised entry. Card-like digits are built at runtime; none is a literal in the repo.
import { describe, expect, it } from "vitest";
import { toBase64url, toHex } from "../src/crypto";
import type { CardRecord } from "../src/generated";
import { appendEntry, findCardData, luhnValid, toJsonl } from "../src/log";
import { validateCardRecord } from "../src/schema";
import { MemoryLogStore } from "../src/testing";
import { luhnValidDigits } from "./crypto-independent";
import { buildDemoLog, DELEGATOR_SEED, demoKeys, demoSteps, ENGINE_SEED, LOG_ID } from "./log-helpers";

const pan = luhnValidDigits(16);
const spaced = pan.replace(/(\d{4})(?=\d)/g, "$1 ");
const dashed = pan.replace(/(\d{4})(?=\d)/g, "$1-");

describe("findCardData", () => {
  it("builds a Luhn-valid test value at runtime", () => {
    expect(luhnValid(pan)).toBe(true);
    expect(luhnValid(`${pan.slice(0, -1)}${(Number(pan.at(-1)) + 1) % 10}`)).toBe(false);
  });

  it.each([
    ["a bare PAN-like run", { note: `order ${pan}` }],
    ["a spaced run", { note: spaced }],
    ["a dashed run", { note: `ref:${dashed}.` }],
    ["a numeric PAN-like value", { amount: Number(luhnValidDigits(15, "3")) }],
    ["a cvv field", { cvv: "123" }],
    ["a pan field", { nested: [{ PAN: "x" }] }],
    ["a card_number field", { card_number: "x" }],
    ["a CVV mention in text", { note: "please send the CVV" }],
  ])("flags %s", (_label, value) => {
    expect(findCardData(value)).not.toBeNull();
  });

  it("does not flag hashes, signatures, did:keys, timestamps, money or ids", async () => {
    const { entries } = await buildDemoLog();
    for (const entry of entries) expect(findCardData(entry)).toBeNull();
    expect(findCardData({ amount_minor: 25900, ts: "2026-10-03T02:00:00Z", phone_like: "2026-10-03" })).toBeNull();
    expect(findCardData({ hex: `${"1".repeat(20)}a${"2".repeat(20)}` })).toBeNull();
  });

  it("never echoes the digits it found", () => {
    expect(findCardData({ note: pan })).not.toContain(pan.slice(4, 12));
  });
});

describe("the log refuses card data (I8)", () => {
  it("rejects a PAN or CVV field on a card record, and a PAN-like run in free text", async () => {
    const keys = demoKeys();
    const steps = demoSteps(keys);
    const store = new MemoryLogStore();
    await appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", steps[0]!.payload as never, new Date());
    const card = steps[2]!.payload as CardRecord;
    for (const payload of [{ ...card, pan }, { ...card, cvv: "1".repeat(3) }, { ...card, purpose: `order ${pan}` }]) {
      expect(validateCardRecord(payload).ok).toBe(false); // the schema layer alone refuses it
      await expect(appendEntry(store, keys.engine, LOG_ID, "CARD_MINTED", payload as never, new Date())).rejects.toMatchObject({
        code: "CARD_DATA",
      });
    }
    const expired = { mandate_id: "mnd_demoM0", expired_at: "2026-10-31T15:59:59Z" };
    const revocation = steps[8]!.payload as { reason?: string };
    for (const [kind, payload] of [
      ["MANDATE_REVOKED", { ...revocation, reason: `card ${spaced}` }],
      ["MANDATE_REVOKED", { ...revocation, reason: "the cvv is on the back" }],
    ] as const) {
      await expect(appendEntry(store, keys.engine, LOG_ID, kind, payload as never, new Date())).rejects.toMatchObject({ code: "CARD_DATA" });
    }
    expect(await store.read(LOG_ID)).toHaveLength(1);
    await appendEntry(store, keys.engine, LOG_ID, "PACKET_EXPIRED", expired, new Date());
    expect(await store.read(LOG_ID)).toHaveLength(2);
  });

  it("serialises no key material: secret seeds never appear in the JSONL", async () => {
    const { entries } = await buildDemoLog();
    const text = toJsonl(entries);
    for (const seed of [ENGINE_SEED, DELEGATOR_SEED]) {
      expect(text).not.toContain(toHex(seed));
      expect(text).not.toContain(toBase64url(seed));
    }
  });
});
