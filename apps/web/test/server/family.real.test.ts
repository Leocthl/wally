// @vitest-environment node
// Family budget over the booth's HTTP routes, on the real stack (real orchestrator, signed log, replay judge and planner,
// seeded SIMULATED rail): GET /api/family, a family seal, the 422 EXCEEDS_PARENT body with its details, the validation of
// the request, the export that carries Mum's credential beside the log, and the two scenarios. HttpApiClient types the error.
import { afterEach, describe, expect, it } from "vitest";
import type { Booth } from "../../server/compose";
import { HttpApiClient } from "../../src/api/http/HttpApiClient";
import { m0SealRequest } from "../../src/api/mock/presets";
import type { BoothSnapshot, FamilySummary, RunSummary, SealRequest } from "../../src/api/types";
import { listen, type Listening } from "./support/listen";
import { bootReal, orchestratorIsReal } from "./support/realStack";

const REAL = await orchestratorIsReal();
const BASE = "http://127.0.0.1:8787";
const booths: Booth[] = [];
const servers: Listening[] = [];

afterEach(async () => {
  for (const b of booths.splice(0)) await b.close();
  for (const s of servers.splice(0)) await s.close();
});

async function boot(env: Readonly<Record<string, string>> = {}): Promise<Booth> {
  const booth = await bootReal(env);
  booths.push(booth);
  return booth;
}

const get = (booth: Booth, path: string) => booth.app.request(`${BASE}${path}`);
const post = (booth: Booth, path: string, body: unknown) =>
  booth.app.request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function budget(amountMinor: number, extra: Record<string, unknown> = { family: { parent: "mum" } }): Record<string, unknown> {
  const m0: SealRequest = m0SealRequest(new Date());
  return { ...m0, rules: { ...m0.rules, budget: { amount_minor: amountMinor, currency: "HKD" } }, ...extra };
}

describe.skipIf(!REAL)("family budget over HTTP", () => {
  it("lists the feature in /api/info and Mum's budget at /api/family (read only, no event)", async () => {
    const booth = await boot();
    const info = (await (await get(booth, "/api/info")).json()) as { features: { family: boolean } };
    expect(info.features.family).toBe(true);
    const res = await get(booth, "/api/family");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()) as FamilySummary).toMatchObject({ parent: "mum", ceilingMinor: 100_000, allocatedMinor: 0, remainingMinor: 100_000, categories: ["apparel"], verifiedSellersOnly: true });
  });

  it("seals HK$800 under Mum, and /api/family and the snapshot show it", async () => {
    const booth = await boot();
    const res = await post(booth, "/api/seal", budget(80_000));
    expect(res.status, await res.clone().text()).toBe(200);
    const sealed = (await res.json()) as { mandate: { parent?: { mandate_id: string } }; packet: { budget_minor: number } };
    expect(sealed.packet.budget_minor).toBe(80_000);
    const mum = (await (await get(booth, "/api/family")).json()) as FamilySummary;
    expect(mum).toMatchObject({ allocatedMinor: 80_000, remainingMinor: 20_000 });
    expect(sealed.mandate.parent?.mandate_id).toBe(mum.mandateId);
    expect(((await (await get(booth, "/api/snapshot")).json()) as BoothSnapshot).mandate?.parent?.mandate_id).toBe(mum.mandateId);
  });

  it("answers 422 EXCEEDS_PARENT with { field, requested, allowed } for HK$1,500, and the budget held is untouched", async () => {
    const booth = await boot();
    const before = (await (await get(booth, "/api/snapshot")).json()) as BoothSnapshot;
    const res = await post(booth, "/api/seal", budget(150_000));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: { code: "EXCEEDS_PARENT", message: "That's more than Mum allows (HK$1,000).", details: { field: "budget", requested: 150_000, allowed: 100_000 } },
    });
    const after = (await (await get(booth, "/api/snapshot")).json()) as BoothSnapshot;
    expect(after.mandate?.id).toBe(before.mandate?.id);
    expect(after.log.entries).toHaveLength(before.log.entries.length);
  });

  it("refuses a malformed family field and a plain request is unchanged", async () => {
    const booth = await boot();
    for (const family of [{ parent: "dad" }, "mum", null, { parent: "mum", extra: true }]) {
      const res = await post(booth, "/api/seal", budget(50_000, { family }));
      expect(res.status, JSON.stringify(family)).toBe(400);
    }
    const plain = await post(booth, "/api/seal", budget(50_000, {}));
    expect(plain.status).toBe(200);
    expect(((await (await get(booth, "/api/snapshot")).json()) as BoothSnapshot).mandate?.parent).toBeUndefined();
  });

  it("exports Mum's credential next to the log and says the offline page cannot check the link", async () => {
    const booth = await boot();
    await post(booth, "/api/seal", budget(80_000));
    const exported = (await (await get(booth, "/api/export")).json()) as { log: string; publicKeys: { parent?: string }; parentCredential?: { issuer: string }; parentNote?: string };
    expect(exported.parentCredential?.issuer).toBe(exported.publicKeys.parent);
    expect(exported.log).not.toContain(exported.publicKeys.parent ?? "no key");
    expect(exported.parentNote).toMatch(/cannot check this link/);
    await post(booth, "/api/seal", budget(80_000, {}));
    expect(((await (await get(booth, "/api/export")).json()) as { parentCredential?: unknown }).parentCredential).toBeUndefined();
  });

  it("runs family_ok (APPROVE) and family_over (DENY with the code), each from where the booth stands", async () => {
    const booth = await boot();
    const over = (await (await post(booth, "/api/scenario/family_over", {})).json()) as RunSummary;
    expect(over).toMatchObject({ scenario: "family_over", outcome: "DENY", code: "EXCEEDS_PARENT" });
    const ok = (await (await post(booth, "/api/scenario/family_ok", {})).json()) as RunSummary;
    expect(ok).toMatchObject({ scenario: "family_ok", outcome: "APPROVE" });
    const snap = (await (await get(booth, "/api/snapshot")).json()) as BoothSnapshot;
    expect(snap.mandate?.rules.budget.amount_minor).toBe(80_000);
    expect(snap.packet?.remaining_minor).toBe(54_100);
  });

  it("HttpApiClient types the refusal: status 422, code and details", async () => {
    const booth = await boot();
    const server = await listen(booth.app);
    servers.push(server);
    const client = new HttpApiClient({ baseUrl: server.baseUrl });
    try {
      await client.snapshot();
      expect((await client.info()).features.family).toBe(true);
      await expect(client.seal({ ...(budget(150_000) as unknown as SealRequest) })).rejects.toMatchObject({
        name: "ApiRequestError",
        status: 422,
        code: "EXCEEDS_PARENT",
        details: { field: "budget", requested: 150_000, allowed: 100_000 },
      });
      const sealed = await client.seal(budget(80_000) as unknown as SealRequest);
      expect(sealed.mandate.parent).toBeDefined();
      expect(await client.family()).toMatchObject({ allocatedMinor: 80_000 });
    } finally {
      client.dispose();
    }
  });
});
