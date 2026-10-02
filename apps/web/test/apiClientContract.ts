// Contract any ApiClient must satisfy, so the later HTTP + SSE client can be checked with the same tests as the mock.
// It uses only the public interface: no sweeping, no fake clock, no knowledge of how the client works inside.
import { describe, expect, it } from "vitest";
import { m0SealRequest } from "../src/api/mock/presets";
import type { ApiClient, TraceEvent } from "../src/api/types";

export interface ContractTarget {
  readonly client: ApiClient;
  /** A fresh client for each test, already holding no mandate. */
  readonly dispose?: () => void;
}

export function apiClientContract(name: string, make: () => Promise<ContractTarget>): void {
  async function sealed() {
    const target = await make();
    const events: TraceEvent[] = [];
    target.client.subscribe((e) => events.push(e));
    await target.client.seal(m0SealRequest(new Date()));
    return { ...target, events };
  }

  describe(`ApiClient contract: ${name}`, () => {
    it("describes itself and says whether outputs are recorded", async () => {
      const { client } = await make();
      const info = await client.info();
      expect(["mock", "http", "local"]).toContain(info.kind);
      expect(typeof info.replayed).toBe("boolean");
      expect(info.realCapture === null || typeof info.realCapture.declineCode === "string").toBe(true);
    });

    it("seal returns the packet and logs exactly one MANDATE_SEALED", async () => {
      const { client } = await sealed();
      const snap = await client.snapshot();
      expect(snap.packet?.remaining_minor).toBe(snap.packet?.budget_minor);
      expect(snap.log.entries.map((e) => e.kind)).toEqual(["MANDATE_SEALED"]);
    });

    it("refuses an invalid mandate and changes nothing (fail closed)", async () => {
      const { client } = await sealed();
      const good = m0SealRequest(new Date());
      await expect(client.seal({ ...good, rules: { ...good.rules, categories: [] as never } })).rejects.toThrow();
      expect((await client.snapshot()).log.entries).toHaveLength(1);
    });

    it("streams a run as trace events that end with run.finished, in pipeline order", async () => {
      const { client, events } = await sealed();
      events.length = 0;
      const run = await client.runScenario("normal");
      expect(run.outcome).toBe("APPROVE");
      expect(events[0]?.type).toBe("run.started");
      expect(events.at(-1)?.type).toBe("run.finished");
      const types = events.map((e) => e.type);
      expect(types.indexOf("decision")).toBeLessThan(types.indexOf("card.minted"));
      expect(types.indexOf("card.minted")).toBeLessThan(types.indexOf("card.event"));
    });

    it("never mints without an APPROVE: a flagged seller leaves no card (I1)", async () => {
      const { client } = await sealed();
      expect((await client.runScenario("flagged")).outcome).toBe("DENY");
      const snap = await client.snapshot();
      expect(snap.cards).toHaveLength(0);
      expect(snap.log.entries.filter((e) => e.kind === "CARD_MINTED")).toHaveLength(0);
    });

    it("mints exactly the approved total (I2) and keeps budget = committed + spent + remaining", async () => {
      const { client, events } = await sealed();
      await client.runScenario("mint");
      const snap = await client.snapshot();
      const decision = snap.log.entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : []))[0];
      expect(snap.cards[0]?.limit_minor).toBe(decision?.approved_limit_minor);
      for (const e of events) {
        if (e.type === "packet") expect(e.packet.committed_minor + e.packet.spent_minor + e.packet.remaining_minor).toBe(e.packet.budget_minor);
      }
    });

    it("writes one signed entry per decision before any card exists (I7)", async () => {
      const { client } = await sealed();
      await client.runScenario("normal");
      const kinds = (await client.snapshot()).log.entries.map((e) => e.kind);
      expect(kinds.indexOf("DECISION")).toBeLessThan(kinds.indexOf("CARD_MINTED"));
      expect(kinds.filter((k) => k === "DECISION")).toHaveLength(1);
    });

    it("verifies an untouched log, fails on a tampered copy, and passes again after restore", async () => {
      const { client } = await sealed();
      await client.runScenario("normal");
      expect((await client.verify()).result.ok).toBe(true);
      const view = await client.tamper();
      expect(view.tampered).not.toBeNull();
      const bad = await client.verify();
      expect(bad.result.ok).toBe(false);
      await client.restore();
      expect((await client.verify()).result.ok).toBe(true);
    });

    it("voids unused cards on revoke and stops later carts at R2 (I6)", async () => {
      const { client } = await sealed();
      await client.runScenario("revoke");
      await client.revoke();
      expect((await client.snapshot()).cards.every((c) => c.state !== "ACTIVE")).toBe(true);
      await client.runScenario("normal");
      const last = (await client.snapshot()).log.entries.flatMap((e) => (e.kind === "DECISION" ? [e.payload] : [])).at(-1);
      expect(last?.outcome).toBe("DENY");
      expect(last?.explanation?.template_id).toBe("R2.revoked");
    });

    it("stops listening after unsubscribe", async () => {
      const { client } = await sealed();
      const seen: TraceEvent[] = [];
      const off = client.subscribe((e) => seen.push(e));
      off();
      await client.runScenario("flagged");
      expect(seen).toHaveLength(0);
    });

    it("reset returns to a freshly sealed packet with no cards", async () => {
      const { client } = await sealed();
      await client.runScenario("normal");
      await client.reset();
      const snap = await client.snapshot();
      expect(snap.cards).toHaveLength(0);
      expect(snap.packet?.remaining_minor).toBe(snap.packet?.budget_minor);
      expect(snap.log.entries).toHaveLength(1);
    });
  });
}
