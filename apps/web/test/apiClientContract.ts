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

    it("says what it can do beyond the booth buttons, and a feature that is on has its method", async () => {
      const { client } = await make();
      const { features } = await client.info();
      expect(typeof features.ask).toBe("boolean");
      expect(typeof features.alternatives).toBe("boolean");
      expect(["model", "rules"]).toContain(features.compile);
      if (features.ask) expect(typeof client.ask).toBe("function");
      if (features.alternatives) expect(typeof client.suggestAlternatives).toBe("function");
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

    it("reads a sentence into rule chips, when it can, and seals nothing (compileRules is optional)", async () => {
      const { client } = await sealed();
      if (client.compileRules === undefined) return;
      const result = await client.compileRules({ text: "HK$800 this month for clothes, verified sellers only", locale: "en" });
      expect(["model", "rules"]).toContain(result.source);
      expect(result.confirmRequired).toBe(true);
      expect(result.rules.budget).toEqual({ amount_minor: 80_000, currency: "HKD" });
      expect(result.rules.categories).toContain("apparel");
      expect(result.labels.map((l) => l.kind)).toEqual(expect.arrayContaining(["budget", "expiry", "category", "sellers"]));
      expect(Date.parse(result.validUntil)).toBeGreaterThan(Date.now());
      expect((await client.snapshot()).log.entries).toHaveLength(1); // still only MANDATE_SEALED
      await expect(client.compileRules({ text: "something nice for clothes", locale: "en" })).rejects.toThrow();
    });

    it("runs a typed request as one custom run, and a repeat of a bought cart is not bought twice (ask is optional)", async () => {
      const { client, events } = await sealed();
      if (!(await client.info()).features.ask || client.ask === undefined) return;
      events.length = 0;
      const first = await client.ask({ requestText: "a cotton tee" });
      expect(first.scenario).toBe("custom");
      expect(["APPROVE", "ESCALATE", "DENY", "INFO"]).toContain(first.outcome);
      const mine = events.filter((e) => "runId" in e && e.runId === first.runId);
      expect(mine[0]).toMatchObject({ type: "run.started", scenario: "custom" });
      expect(mine.at(-1)?.type).toBe("run.finished");
      if (first.outcome !== "APPROVE") return;
      const again = await client.ask({ requestText: "a cotton tee" });
      expect(again).toMatchObject({ outcome: "APPROVE", duplicate: true, decisionId: first.decisionId });
      const snap = await client.snapshot();
      expect(snap.log.entries.filter((e) => e.kind === "DECISION")).toHaveLength(1);
      expect(snap.cards).toHaveLength(1);
    });

    it("a request nothing can be chosen for is an INFO run: no decision, no card (ask is optional)", async () => {
      const { client } = await sealed();
      if (!(await client.info()).features.ask || client.ask === undefined) return;
      const run = await client.ask({ requestText: "qxzv wmpl ghtk" });
      expect(run.outcome).toBe("INFO");
      const snap = await client.snapshot();
      expect(snap.cards).toHaveLength(0);
      expect(snap.log.entries.filter((e) => e.kind === "DECISION")).toHaveLength(0);
    });

    it("cheaper options are only for a stop by the budget: a flagged seller has none (suggestAlternatives is optional)", async () => {
      const { client } = await sealed();
      if (client.suggestAlternatives === undefined) return;
      const flagged = await client.runScenario("flagged");
      await expect(client.suggestAlternatives({ decisionId: flagged.decisionId ?? "dec_missing000" })).rejects.toThrow();
      expect((await client.snapshot()).cards).toHaveLength(0);
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
