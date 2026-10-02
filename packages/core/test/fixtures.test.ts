import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES_DIR, listFixtureFiles, loadFixture, readFixture } from "../src/testing/fixtures";
import { mandateFromCredential } from "../src/vc";

const files = listFixtureFiles();
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const listings = files.filter((f) => f.startsWith("listings/")).map((f) => loadFixture(f, "listing-record"));
const captures = files.filter((f) => f.startsWith("scameter/")).map((f) => loadFixture(f, "scameter-capture"));

describe("data/fixtures", () => {
  it("has the storyline set", () => {
    for (const f of ["mandate/m0.credential.json", "packet/initial.json", "carts/attempt-3b.json", "planner/attempt-1.json"]) {
      expect(files).toContain(f);
    }
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it.each(files)("%s: envelope is SIMULATED and data matches its schema", (file) => {
    expect(() => readFixture(file)).not.toThrow();
  });

  it("contains no card-number-like digit runs (I8)", () => {
    for (const file of files) {
      const text = readFileSync(join(FIXTURES_DIR, file), "utf8");
      expect(text, file).not.toMatch(/(?:\d[ -]?){13,19}/);
      expect(text.toLowerCase(), file).not.toMatch(/cvv/);
    }
  });

  it("keeps the HK$800 storyline amounts [F20-F23]", () => {
    const total = (n: string) => loadFixture(`carts/${n}.json`, "cart").total_minor;
    expect(loadFixture("packet/initial.json", "packet-state").remaining_minor).toBe(80000);
    expect(total("attempt-1")).toBe(25900);
    const left = loadFixture("packet/after-attempt-1.json", "packet-state").remaining_minor;
    expect(left).toBe(80000 - 25900);
    const a3 = loadFixture("carts/attempt-3.json", "cart");
    expect([a3.subtotal_minor, a3.shipping_minor, a3.total_minor]).toEqual([52000, 3000, 55000]);
    expect(a3.total_minor - left).toBe(900);
    expect(total("attempt-4")).toBe(12000);
    for (const n of ["attempt-2", "attempt-3b", "attempt-4"]) expect(total(n)).toBeLessThanOrEqual(left);
  });

  it("builds every cart from its listing record and Scameter capture", () => {
    for (const file of files.filter((f) => f.startsWith("carts/"))) {
      const cart = loadFixture(file, "cart");
      const listing = listings.find((l) => l.url === cart.listing.url);
      expect(listing, file).toBeDefined();
      expect(cart.listing.text_sha256).toBe(sha256(listing?.text ?? ""));
      expect(cart.merchant).toEqual(listing?.merchant);
      const capture = captures.find((c) => c.capture_ref === cart.scameter.capture_ref);
      expect(capture?.state).toBe(cart.scameter.state);
      const subtotal = cart.items.reduce((sum, i) => sum + i.qty * i.unit_price_minor, 0);
      expect(cart.subtotal_minor).toBe(subtotal);
      expect(cart.total_minor).toBe(subtotal + cart.shipping_minor + cart.fees_minor);
    }
  });

  it("has a domain mandate equal to mandateFromCredential(credential)", () => {
    const vc = loadFixture("mandate/m0.credential.json", "mandate-credential");
    expect(mandateFromCredential(vc)).toEqual(loadFixture("mandate/m0.json", "mandate"));
  });

  it("has planner replays that only pick items from the listings they were given", () => {
    for (const file of files.filter((f) => f.startsWith("planner/"))) {
      const replay = loadFixture(file, "planner-replay");
      if (replay.proposal === null) continue;
      const listing = listings.find((l) => l.url === replay.proposal?.listing_url);
      expect(replay.listing_ids).toContain(listing?.id);
      for (const item of replay.proposal.items) expect(listing?.items.map((i) => i.title)).toContain(item.title);
    }
  });

  it("has recorded judge answers for every listing", () => {
    for (const file of files.filter((f) => f.startsWith("listings/"))) {
      expect(files).toContain(file.replace("listings/", "judge/"));
    }
  });
});
