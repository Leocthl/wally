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

  it("never echoes the digits it found, in a value or in a key", () => {
    expect(findCardData({ note: pan })).not.toContain(pan.slice(4, 12));
    expect(findCardData({ [pan]: "x" })).not.toContain(pan.slice(4, 12));
    expect(findCardData({ [`card_number_${pan}`]: "x" })).not.toContain(pan.slice(4, 12));
  });
});

describe("findCardData after normalising (S-I8-1)", () => {
  const script = (zero: number) => pan.replace(/\d/g, (d) => String.fromCodePoint(zero + Number(d)));

  it.each([
    ["Arabic-Indic digits", script(0x0660)],
    ["Devanagari digits", script(0x0966)],
    ["mathematical bold digits", script(0x1d7ce)],
    ["mathematical monospace digits", script(0x1d7f6)],
    ["three separators between groups", pan.replace(/(\d{4})(?=\d)/g, "$1 - ")],
    ["a soft hyphen between every digit", pan.split("").join(String.fromCharCode(0xad))],
    ["an ideographic space between groups", pan.replace(/(\d{4})(?=\d)/g, `$1${String.fromCharCode(0x3000)}`)],
    ["Chinese text right before it", `卡號${pan}`],
  ])("flags a PAN written with %s", (_name, text) => {
    expect(findCardData({ reason: text })).not.toBeNull();
  });

  it.each(["cardNumber", "Card Number", "CARD-NO", "cc_num", "creditCardNumber", "card_pan", "pan_hash", "cvv2", "CVC", "card_cvv", "cvn2", "csc", "securityCode", "card_verification_value", "exp_month", "card_expiry", "expiry_date"])(
    "flags the key %s",
    (key) => {
      expect(findCardData({ nested: { [key]: "x" } })).not.toBeNull();
    },
  );

  it.each(["send the CVC", "cvv: 123", "CVV2", "security-code", "card verification"])("flags the text %j", (text) => {
    expect(findCardData({ reason: text })).not.toBeNull();
  });

  it("keeps false positives low: money, times, ids, hashes, keys and encodings pass", async () => {
    const { entries } = await buildDemoLog();
    const signature = entries[1]!.signature;
    const clean = {
      amount_minor: 25900,
      budget_minor: 99_999_999,
      ts: "2026-10-03T02:00:00.000Z",
      date: "2026/10/03 02:00",
      price: "HK$1,234.56 incl. HK$30 shipping",
      phone: "+852 9123 4567",
      ip: "192.168.001.001",
      version: "core@0.1.0+demo 1.2.3",
      decision: "dec_demoA1",
      card: "crd_demoA1",
      handle: "hdl_SIMULATEDdemoA1handle",
      last4: "0000",
      hex: "643820c38a88c8fa0a93d4ddfce7ec034661cd410473d7a6fc53bc4caa964f8c",
      did: entries[0]!.signer,
      signature,
      proofValue: "z4KV9AQvb21v83w4AKXGp6W9dTWXfmg3RTZ7EWHMxdrdDauE3gfMhKeEeZPi4A1NR6g8BQ5haJ34VZjedi8E8m4gG",
      expires_at: "2026-10-03T02:35:02Z",
      company: "Demo Apparel (SIMULATED)",
      span: 3,
      expand: true,
      card_id: "crd_demoA1",
      decline_code: "OVER_LIMIT",
      intent_text: "HK$800 衫, verified sellers.",
    };
    expect(findCardData(clean)).toBeNull();
    for (const entry of entries) expect(findCardData(entry)).toBeNull();
  });

  it("refuses a long digit run inside a card handle even within a token", () => {
    expect(findCardData({ handle: `hdl_SIM${pan}` })).not.toBeNull();
    expect(findCardData({ handle: `hdl_${pan.match(/.{4}/g)!.join("_")}` })).not.toBeNull();
    expect(findCardData({ handle: "hdl_SIMULATEDhandle000001" })).toBeNull();
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

  it("CARD_MINTED logs the SIMULATED handle by design, but a handle carrying a PAN is refused", async () => {
    const keys = demoKeys();
    const steps = demoSteps(keys);
    const store = new MemoryLogStore();
    await appendEntry(store, keys.engine, LOG_ID, "MANDATE_SEALED", steps[0]!.payload as never, new Date());
    await appendEntry(store, keys.engine, LOG_ID, "DECISION", steps[1]!.payload as never, new Date());
    const card = steps[2]!.payload as CardRecord;
    for (const handle of [`hdl_${pan}`, `hdl_${dashed}`, `hdl_SIM${pan}`, `hdl_${pan.match(/.{4}/g)!.join("_")}`]) {
      expect(validateCardRecord({ ...card, handle }).ok).toBe(true); // the schema alone would take it
      await expect(appendEntry(store, keys.engine, LOG_ID, "CARD_MINTED", { ...card, handle }, new Date())).rejects.toMatchObject({ code: "CARD_DATA" });
    }
    await appendEntry(store, keys.engine, LOG_ID, "CARD_MINTED", card, new Date());
    expect(await store.read(LOG_ID)).toHaveLength(3);
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
