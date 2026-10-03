// A price limit in a typed Ask ("a cotton tee under HK$50", "三百蚊以下"). The planner proposes; code prices the proposal from
// the listing record (quantity times unit price, plus shipping and fees: the cart builder's arithmetic) and a cart above the
// limit the shopper typed is no proposal, so the run ends as NO_PROPOSAL and the reader shows what fits. It only ever tightens.
// The fixed booth buttons, a photo pick and the recorded asks of the on-device page never meet it.
import type { ListingRecord } from "@wally/core/generated";
import type { PlannerContext, PlannerPort, ProposeCartInput } from "@wally/core/ports";
import { describe, expect, it, vi } from "vitest";
import { loadBundle } from "../src/api/local/bundle";
import { askShelf, type AskSource } from "../src/booth/backend/ask";
import { proposalTotalMinor, withAskLimit } from "../src/booth/backend/askLimit";

const bundle = loadBundle();
const SHELF = askShelf(bundle.catalogue, bundle.table);
const LIVE: AskSource = { kind: "live", shelf: SHELF };
const OPTS = { timeoutMs: 1_000 };

const listing = (id: string): ListingRecord => {
  const found = bundle.catalogue.listings.get(id);
  if (found === undefined) throw new Error(`no listing ${id}`);
  return found;
};
/** What the orchestrator hands a planner: the request and the listing urls, never the listing text (I4). */
const ctxFor = (requestText: string, listings: readonly ListingRecord[] = SHELF): PlannerContext => ({ intentText: requestText, listings: listings.map((l) => ({ url: l.url, text: "" })) });

const TEE: ProposeCartInput = { listing_url: "https://demo-apparel.example/p/tee", items: [{ title: "Cotton tee (SIMULATED)", qty: 1 }], note: "the request names it" }; // HK$259, free shipping
const SOCKS: ProposeCartInput = { listing_url: "https://demo-apparel.example/p/socks", items: [{ title: "Ankle socks, 3 pairs (SIMULATED)", qty: 1 }] }; // HK$120
const JACKET: ProposeCartInput = { listing_url: "https://demo-streetwear.example/p/jacket", items: [{ title: "Denim jacket (SIMULATED)", qty: 1 }] }; // HK$520 plus HK$30 shipping

function stub(proposal: ProposeCartInput | null): PlannerPort & { readonly propose: ReturnType<typeof vi.fn>; readonly alternatives: ReturnType<typeof vi.fn> } {
  return { propose: vi.fn(async () => proposal), alternatives: vi.fn(async () => proposal) };
}
const planner = (proposal: ProposeCartInput | null): PlannerPort => withAskLimit(() => stub(proposal), LIVE)(SHELF);

describe("proposalTotalMinor: the cart total the cart builder would make, in integer minor units", () => {
  it("is quantity times unit price plus shipping plus fees", () => {
    expect(proposalTotalMinor(TEE, SHELF)).toBe(25_900);
    expect(proposalTotalMinor(SOCKS, SHELF)).toBe(12_000);
    expect(proposalTotalMinor(JACKET, SHELF)).toBe(55_000); // shipping counts
    expect(proposalTotalMinor({ ...SOCKS, items: [{ title: "Ankle socks, 3 pairs (SIMULATED)", qty: 3 }] }, SHELF)).toBe(36_000);
  });

  it("is null for anything it cannot price: an unknown listing, an unknown title, no items, a bad quantity", () => {
    expect(proposalTotalMinor({ ...TEE, listing_url: "https://nowhere.example/p/x" }, SHELF)).toBeNull();
    expect(proposalTotalMinor({ ...TEE, items: [{ title: "Cotton tee", qty: 1 }] }, SHELF)).toBeNull(); // the title must match exactly
    expect(proposalTotalMinor({ ...TEE, items: [] }, SHELF)).toBeNull();
    for (const qty of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
      expect(proposalTotalMinor({ ...TEE, items: [{ title: "Cotton tee (SIMULATED)", qty }] }, SHELF), `qty ${qty}`).toBeNull();
    }
  });
});

describe("withAskLimit on the whole shelf", () => {
  it("drops a proposal whose cart is above the limit in the words: the cotton tee under HK$50", async () => {
    const inner = stub(TEE);
    expect(await withAskLimit(() => inner, LIVE)(SHELF).propose(ctxFor("a cotton tee under HK$50"), OPTS)).toBeNull();
    expect(inner.propose).toHaveBeenCalledOnce(); // the planner was asked as before; only its answer is checked
  });

  it("keeps a proposal at or under the limit, and one with no limit in the words, unchanged", async () => {
    const wrapped = withAskLimit(() => stub(TEE), LIVE)(SHELF);
    expect(await wrapped.propose(ctxFor("a cotton tee under HK$300"), OPTS)).toBe(TEE);
    expect(await wrapped.propose(ctxFor("a cotton tee under HK$259"), OPTS)).toBe(TEE); // equal to the limit fits
    expect(await wrapped.propose(ctxFor("a cotton tee"), OPTS)).toBe(TEE);
  });

  it("never lets a limit with cents rise: HK$258.99 is read as HK$258, so the HK$259 tee is dropped", async () => {
    expect(await planner(TEE).propose(ctxFor("a cotton tee under HK$258.99"), OPTS)).toBeNull();
  });

  it("counts shipping: a jacket of HK$520 plus HK$30 shipping does not fit under HK$540", async () => {
    expect(await planner(JACKET).propose(ctxFor("a denim jacket under 540"), OPTS)).toBeNull();
    expect(await planner(JACKET).propose(ctxFor("a denim jacket under 550"), OPTS)).toBe(JACKET);
  });

  it("reads the Chinese limits the Ask sheet teaches: 三百蚊以下, 預算一百五十, HK$150以內", async () => {
    expect(await planner(TEE).propose(ctxFor("白色T恤 三百蚊以下"), OPTS)).toBe(TEE);
    expect(await planner(TEE).propose(ctxFor("白色T恤 一百蚊以下"), OPTS)).toBeNull();
    expect(await planner(TEE).propose(ctxFor("我想買件白色T恤，預算一百五十"), OPTS)).toBeNull();
    expect(await planner(SOCKS).propose(ctxFor("襪 HK$150以內"), OPTS)).toBe(SOCKS);
  });

  it("limits the cheaper pick after a budget stop the same way", async () => {
    const stop = { templateId: "R3.over_remaining", remainingMinor: 54_100 } as const;
    expect(await planner(TEE).alternatives?.(ctxFor("a denim jacket under HK$100"), stop, OPTS)).toBeNull();
    expect(await planner(SOCKS).alternatives?.(ctxFor("a denim jacket under HK$150"), stop, OPTS)).toBe(SOCKS);
  });

  it("leaves no proposal as no proposal, and fails closed on a proposal it cannot price when a limit was asked", async () => {
    expect(await planner(null).propose(ctxFor("a cotton tee under HK$50"), OPTS)).toBeNull();
    const unknown: ProposeCartInput = { listing_url: "https://nowhere.example/p/x", items: [{ title: "Anything", qty: 1 }] };
    expect(await planner(unknown).propose(ctxFor("a cotton tee under HK$500"), OPTS)).toBeNull();
    expect(await planner(unknown).propose(ctxFor("a cotton tee"), OPTS)).toBe(unknown); // no limit: nothing to check, the cart builder decides
  });

  it("does not turn a long amount or a stray number into a limit: 9e99 and 0.5 are not prices", async () => {
    expect(await planner(TEE).propose(ctxFor("a cotton tee under 9e99"), OPTS)).toBe(TEE);
    expect(await planner(TEE).propose(ctxFor("a cotton tee under 0.5"), OPTS)).toBe(TEE);
  });
});

describe("withAskLimit leaves everything else alone", () => {
  it("does nothing for the fixed booth buttons, a photo pick or any listing set that is not the whole shelf", async () => {
    const inner = stub(TEE);
    const factory = withAskLimit(() => inner, LIVE);
    for (const set of [[listing("lst_demoTee")], [listing("lst_demoJacket"), listing("lst_demoTee"), listing("lst_demoSocks")], SHELF.slice(0, SHELF.length - 1)]) {
      const wrapped = factory(set);
      expect(wrapped, `${set.length} listings`).toBe(inner);
      expect(await wrapped.propose(ctxFor("a cotton tee under HK$50", set), OPTS)).toBe(TEE);
    }
  });

  it("does nothing on the recorded source (the on-device page): the factory comes back as it was", () => {
    const factory = () => stub(TEE);
    const recorded: AskSource = { kind: "recorded", requests: new Map(), unknownNote: "" };
    expect(withAskLimit(factory, recorded)).toBe(factory);
  });

  it("recognises the shelf by its listing ids in any order", async () => {
    const reversed = [...SHELF].reverse();
    expect(await withAskLimit(() => stub(TEE), LIVE)(reversed).propose(ctxFor("a cotton tee under HK$50", reversed), OPTS)).toBeNull();
  });

  it("has no alternatives method when the planner has none", () => {
    const wrapped = withAskLimit(() => ({ propose: async () => TEE }), LIVE)(SHELF);
    expect(wrapped.alternatives).toBeUndefined();
  });
});
