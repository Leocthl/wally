// The photo flow as state: prepare on the phone, ask the booth to look, keep the matches in step with the chips; or read the
// shopper's own words. Fake picture preparation and a fake booth: no canvas, no network. Covers what is sent (the picture only
// when the booth has a model), stale answers, cancel, object URLs that never leak, and every failure ending in a state the
// screen can word.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, SeeRequest, SeeResult } from "../src/api/types";
import { PrepareError, type Prepared } from "../src/screens/photo/prepare";
import { usePhotoFlow, type PhotoDeps, type PhotoSource } from "../src/screens/photo/usePhotoFlow";

const FILE = new File(["x"], "look.jpg", { type: "image/jpeg" });
const PICTURE: PhotoSource = { kind: "picture", file: FILE };
const WORDS: PhotoSource = { kind: "words", text: "white tee under HK$150" };
const PREPARED: Prepared = { blob: new Blob(["jpeg"]), data: "AAAA", width: 768, height: 1024, palette: [{ color: "navy", share: 0.7 }, { color: "white", share: 0.2 }] };
const MATCH = (id: string) => ({ listingId: id, kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: [], merchantName: "Demo Outlet (SIMULATED)", priceMinor: 34_900, totalMinor: 37_900, score: 90, reasons: ["same_kind"] }) as const;
const RESULT: SeeResult = { source: "model", attributes: { kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: ["streetwear"] }, palette: PREPARED.palette, matches: [MATCH("lst_a"), MATCH("lst_b")] };
const WORDS_RESULT: SeeResult = { source: "text", attributes: { kind: "tee", colors: ["white"], pattern: null, fit: null, style: [] }, palette: [], maxPriceMinor: 15_000, matches: [MATCH("lst_w1"), MATCH("lst_w2")] };

type SeeFn = NonNullable<ApiClient["see"]>;
const fakeApi = (see: SeeFn | undefined): ApiClient => ({ see }) as unknown as ApiClient;

/** Every object URL made and not yet revoked: a leak is a URL left in `live`. */
function urlLedger(): { readonly create: (blob: Blob) => string; readonly revoke: (url: string) => void; readonly live: Set<string>; readonly made: () => number } {
  let n = 0;
  const live = new Set<string>();
  return {
    create: () => {
      n += 1;
      const url = `blob:picture-${n}`;
      live.add(url);
      return url;
    },
    revoke: (url) => void live.delete(url),
    live,
    made: () => n,
  };
}

function deps(see: SeeFn | undefined, patch: Partial<PhotoDeps> = {}): PhotoDeps {
  return { api: fakeApi(see), mode: "model", prepare: async () => PREPARED, createUrl: () => "blob:picture", revokeUrl: () => undefined, debounceMs: 5, ...patch };
}

afterEach(() => vi.restoreAllMocks());

describe("usePhotoFlow", () => {
  it("is idle with nothing to look at", () => {
    const { result } = renderHook(() => usePhotoFlow(null, deps(async () => RESULT)));
    expect(result.current.phase.name).toBe("idle");
    expect(result.current.matches).toEqual([]);
  });

  it("prepares, looks, and settles with what the booth read", async () => {
    const see = vi.fn<SeeFn>(async () => RESULT);
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect(result.current.attributes).toEqual(RESULT.attributes);
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_a", "lst_b"]);
    expect(result.current.pictureUrl).toBe("blob:picture");
    expect(result.current.mode).toBe("model");
    expect(result.current.edited).toBe(false);
    expect(result.current.updates).toBe(0);
    expect(see).toHaveBeenCalledTimes(1);
  });

  it("sends the picture only when the booth has a model, and the colour plates always", async () => {
    const withModel = vi.fn<SeeFn>(async () => RESULT);
    const a = renderHook(() => usePhotoFlow(PICTURE, deps(withModel, { mode: "model" })));
    await waitFor(() => expect(a.result.current.phase.name).toBe("ready"));
    expect(withModel.mock.calls[0]?.[0]).toEqual({ image: { mime: "image/jpeg", data: "AAAA" }, palette: PREPARED.palette });

    const palette = vi.fn<SeeFn>(async () => ({ ...RESULT, source: "palette", matches: [] }));
    const b = renderHook(() => usePhotoFlow(PICTURE, deps(palette, { mode: "palette" })));
    await waitFor(() => expect(b.result.current.phase.name).toBe("ready"));
    expect(palette.mock.calls[0]?.[0]).toEqual({ palette: PREPARED.palette });
    expect(JSON.stringify(palette.mock.calls[0]?.[0])).not.toContain("AAAA");
  });

  it("shows looking while the booth reads, with the picture already on screen", async () => {
    let release: (r: SeeResult) => void = () => undefined;
    const see: SeeFn = () => new Promise<SeeResult>((resolve) => (release = resolve));
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("looking"));
    expect(result.current.pictureUrl).toBe("blob:picture");
    await act(async () => release(RESULT));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
  });

  it("a run of chip taps asks once, with the final words, and the old list stays until the new one arrives", async () => {
    const see = vi.fn<SeeFn>(async (req: SeeRequest) => (req.attributes === undefined ? RESULT : { ...RESULT, source: "chips", attributes: { ...RESULT.attributes, ...req.attributes } as SeeResult["attributes"], matches: [MATCH("lst_c")] }));
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => {
      result.current.setKind("jacket");
      result.current.toggleColor("white");
      result.current.setFit("slim");
    });
    expect(result.current.refreshing).toBe(true);
    expect(result.current.edited).toBe(true);
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_a", "lst_b"]);
    await waitFor(() => expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_c"]));
    expect(see).toHaveBeenCalledTimes(2);
    expect(see.mock.calls[1]?.[0]).toEqual({ attributes: { kind: "jacket", colors: ["navy", "white"], pattern: "plain", fit: "slim", style: ["streetwear"] }, palette: PREPARED.palette });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.updates).toBe(1);
  });

  it("ignores a slow answer to an old tap", async () => {
    const waiting: ((r: SeeResult) => void)[] = [];
    const see = vi.fn<SeeFn>((req) => (req.attributes === undefined ? Promise.resolve(RESULT) : new Promise<SeeResult>((resolve) => waiting.push(resolve))));
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.setKind("tee"));
    await waitFor(() => expect(waiting).toHaveLength(1));
    act(() => result.current.setKind("jacket"));
    await waitFor(() => expect(waiting).toHaveLength(2));
    await act(async () => waiting[1]?.({ ...RESULT, matches: [MATCH("lst_new")] }));
    await act(async () => waiting[0]?.({ ...RESULT, matches: [MATCH("lst_old")] }));
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_new"]);
  });

  it("asks nothing for a tap that changes nothing", async () => {
    const see = vi.fn<SeeFn>(async () => RESULT);
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.setKind("hoodie"));
    await new Promise((r) => setTimeout(r, 30));
    expect(see).toHaveBeenCalledTimes(1);
    expect(result.current.edited).toBe(false);
  });

  it("picks one card, picks it off again, and forgets a pick the new list no longer has", async () => {
    const see: SeeFn = async (req) => (req.attributes === undefined ? RESULT : { ...RESULT, matches: [MATCH("lst_b")] });
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.pick("lst_a"));
    expect(result.current.pickedId).toBe("lst_a");
    act(() => result.current.pick("lst_a"));
    expect(result.current.pickedId).toBeNull();
    act(() => result.current.pick("lst_a"));
    act(() => result.current.setKind("tee"));
    await waitFor(() => expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_b"]));
    expect(result.current.pickedId).toBeNull();
  });

  it("closing drops the answer still in flight and releases the picture", async () => {
    const revoke = vi.fn();
    let release: (r: SeeResult) => void = () => undefined;
    const see: SeeFn = () => new Promise<SeeResult>((resolve) => (release = resolve));
    const { result, rerender } = renderHook(({ source }: { source: PhotoSource | null }) => usePhotoFlow(source, deps(see, { revokeUrl: revoke })), { initialProps: { source: PICTURE as PhotoSource | null } });
    await waitFor(() => expect(result.current.phase.name).toBe("looking"));
    rerender({ source: null });
    expect(result.current.phase.name).toBe("idle");
    expect(revoke).toHaveBeenCalledWith("blob:picture");
    await act(async () => release(RESULT));
    expect(result.current.phase.name).toBe("idle");
    expect(result.current.matches).toEqual([]);
  });

  it("a new picture starts a fresh look", async () => {
    const see = vi.fn<SeeFn>(async () => RESULT);
    const { result, rerender } = renderHook(({ source }: { source: PhotoSource }) => usePhotoFlow(source, deps(see)), { initialProps: { source: PICTURE } });
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.pick("lst_a"));
    rerender({ source: { kind: "picture", file: new File(["y"], "other.jpg", { type: "image/jpeg" }) } });
    await waitFor(() => expect(see).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect(result.current.pickedId).toBeNull();
  });
});

describe("object URLs of the picture never leak", () => {
  it("one is made for the picture and revoked when the sheet closes", async () => {
    const ledger = urlLedger();
    const { result, rerender } = renderHook(({ source }: { source: PhotoSource | null }) => usePhotoFlow(source, deps(async () => RESULT, { createUrl: ledger.create, revokeUrl: ledger.revoke })), { initialProps: { source: PICTURE as PhotoSource | null } });
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect([...ledger.live]).toEqual(["blob:picture-1"]);
    rerender({ source: null });
    expect(ledger.live.size).toBe(0);
  });

  it("a second picture replaces the first one's URL, and a retry replaces it again", async () => {
    const ledger = urlLedger();
    let calls = 0;
    const see: SeeFn = async () => (++calls === 2 ? Promise.reject(new Error("network")) : RESULT);
    const { result, rerender } = renderHook(({ source }: { source: PhotoSource }) => usePhotoFlow(source, deps(see, { createUrl: ledger.create, revokeUrl: ledger.revoke })), { initialProps: { source: PICTURE } });
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    rerender({ source: { kind: "picture", file: new File(["y"], "other.jpg", { type: "image/jpeg" }) } });
    await waitFor(() => expect(result.current.phase.name).toBe("error"));
    expect(ledger.live.size).toBe(1);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect(ledger.live.size).toBe(1);
    expect(ledger.made()).toBe(3);
  });

  it("closing while the picture is still being prepared makes no URL at all, and the late answer is dropped", async () => {
    const ledger = urlLedger();
    let finish: (p: Prepared) => void = () => undefined;
    const prepare = () => new Promise<Prepared>((resolve) => (finish = resolve));
    const see = vi.fn<SeeFn>(async () => RESULT);
    const { result, rerender } = renderHook(({ source }: { source: PhotoSource | null }) => usePhotoFlow(source, deps(see, { prepare, createUrl: ledger.create, revokeUrl: ledger.revoke })), { initialProps: { source: PICTURE as PhotoSource | null } });
    await waitFor(() => expect(result.current.phase.name).toBe("preparing"));
    rerender({ source: null });
    await act(async () => finish(PREPARED));
    expect(ledger.made()).toBe(0);
    expect(see).not.toHaveBeenCalled();
    expect(result.current.phase.name).toBe("idle");
  });

  it("a second picture while the first is still being read: the first's late answer never lands, and no URL is left behind", async () => {
    const ledger = urlLedger();
    const waiting: ((r: SeeResult) => void)[] = [];
    const see: SeeFn = () => new Promise<SeeResult>((resolve) => waiting.push(resolve));
    const { result, rerender } = renderHook(({ source }: { source: PhotoSource }) => usePhotoFlow(source, deps(see, { createUrl: ledger.create, revokeUrl: ledger.revoke })), { initialProps: { source: PICTURE } });
    await waitFor(() => expect(waiting).toHaveLength(1));
    rerender({ source: { kind: "picture", file: new File(["y"], "other.jpg", { type: "image/jpeg" }) } });
    await waitFor(() => expect(waiting).toHaveLength(2));
    await act(async () => waiting[1]?.({ ...RESULT, matches: [MATCH("lst_second")] }));
    await act(async () => waiting[0]?.({ ...RESULT, matches: [MATCH("lst_first")] }));
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_second"]);
    expect(ledger.live.size).toBe(1);
  });
});

describe("the shopper's own words", () => {
  it("are sent as words (no picture, no prepare), and settle with the reading, the limit and the matches", async () => {
    const see = vi.fn<SeeFn>(async () => WORDS_RESULT);
    const prepare = vi.fn(async () => PREPARED);
    const { result } = renderHook(() => usePhotoFlow(WORDS, deps(see, { prepare })));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect(see.mock.calls[0]?.[0]).toEqual({ text: "white tee under HK$150" });
    expect(prepare).not.toHaveBeenCalled();
    expect(result.current.mode).toBe("words");
    expect(result.current.pictureUrl).toBeNull();
    expect(result.current.attributes).toEqual(WORDS_RESULT.attributes);
    expect(result.current.maxPriceMinor).toBe(15_000);
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_w1", "lst_w2"]);
  });

  it("keep the limit when a chip is tapped, and send no picture colours", async () => {
    const see = vi.fn<SeeFn>(async (req) => (req.text !== undefined ? WORDS_RESULT : { ...WORDS_RESULT, source: "chips", matches: [MATCH("lst_c")] }));
    const { result } = renderHook(() => usePhotoFlow(WORDS, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.toggleColor("black"));
    await waitFor(() => expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_c"]));
    expect(see.mock.calls[1]?.[0]).toEqual({ attributes: { kind: "tee", colors: ["white", "black"], pattern: null, fit: null, style: [] }, palette: [], maxPriceMinor: 15_000 });
    expect(result.current.maxPriceMinor).toBe(15_000);
  });

  it("lift the limit on request: it is gone from the next look-up", async () => {
    const see = vi.fn<SeeFn>(async (req) => (req.text !== undefined ? WORDS_RESULT : { ...WORDS_RESULT, source: "chips", maxPriceMinor: undefined as never, matches: [MATCH("lst_all")] }));
    const { result } = renderHook(() => usePhotoFlow(WORDS, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.clearLimit());
    expect(result.current.maxPriceMinor).toBeNull();
    await waitFor(() => expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_all"]));
    expect(see.mock.calls[1]?.[0]).toEqual({ attributes: WORDS_RESULT.attributes, palette: [] });
  });

  it("clearing a limit that is not there asks nothing", async () => {
    const see = vi.fn<SeeFn>(async () => ({ ...WORDS_RESULT, maxPriceMinor: undefined as never }));
    const { result } = renderHook(() => usePhotoFlow(WORDS, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.clearLimit());
    await new Promise((r) => setTimeout(r, 30));
    expect(see).toHaveBeenCalledTimes(1);
  });

  it("carry the booth's notice for words it could not use", async () => {
    const see: SeeFn = async () => ({ source: "text", attributes: { kind: null, colors: [], pattern: null, fit: null, style: [] }, palette: [], matches: [], notice: "not_sold" });
    const { result } = renderHook(() => usePhotoFlow({ kind: "words", text: "AirPods" }, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect(result.current.notice).toBe("not_sold");
    expect(result.current.matches).toEqual([]);
  });

  it("the same words in a new object are not a new look (a caller that builds the source inline cannot loop it)", async () => {
    const see = vi.fn<SeeFn>(async () => WORDS_RESULT);
    const { result, rerender } = renderHook(() => usePhotoFlow({ kind: "words", text: "white tee" }, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 20));
    expect(see).toHaveBeenCalledTimes(1);
  });

  it("new words start a fresh look and drop the old pick and limit", async () => {
    const see = vi.fn<SeeFn>(async (req) => (req.text === "hoodie" ? { ...WORDS_RESULT, maxPriceMinor: undefined as never, matches: [MATCH("lst_h")] } : WORDS_RESULT));
    const { result, rerender } = renderHook(({ source }: { source: PhotoSource }) => usePhotoFlow(source, deps(see)), { initialProps: { source: WORDS } });
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.pick("lst_w1"));
    rerender({ source: { kind: "words", text: "hoodie" } });
    await waitFor(() => expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_h"]));
    expect(result.current.pickedId).toBeNull();
    expect(result.current.maxPriceMinor).toBeNull();
  });
});

describe("failures end in a state the screen can word", () => {
  const problem = (flow: ReturnType<typeof usePhotoFlow>): string => (flow.phase.name === "error" ? flow.phase.problem : "none");

  it.each([
    ["a file that cannot be read", { prepare: async () => Promise.reject(new PrepareError("unreadable")) }, async () => RESULT, "unreadable"],
    ["a file that is too large", { prepare: async () => Promise.reject(new PrepareError("too_large")) }, async () => RESULT, "too_large"],
    ["the booth refusing a large picture (413)", {}, async () => Promise.reject(Object.assign(new Error("x"), { status: 413 })), "too_large"],
    ["the booth refusing the picture's type", {}, async () => Promise.reject(Object.assign(new Error("x"), { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" })), "unreadable"],
    ["the booth not answering", {}, async () => Promise.reject(new Error("network")), "failed"],
  ] as const)("%s", async (_name, patch, see, expected) => {
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see as SeeFn, patch)));
    await waitFor(() => expect(problem(result.current)).toBe(expected));
  });

  it("a client without see() is a failure, not a crash", async () => {
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(undefined)));
    await waitFor(() => expect(problem(result.current)).toBe("failed"));
  });

  it("words the booth cannot read are a failure the screen can word too", async () => {
    const { result } = renderHook(() => usePhotoFlow(WORDS, deps(async () => Promise.reject(new Error("network")))));
    await waitFor(() => expect(problem(result.current)).toBe("failed"));
  });

  it("try again looks again", async () => {
    let calls = 0;
    const see: SeeFn = async () => (++calls === 1 ? Promise.reject(new Error("network")) : RESULT);
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(problem(result.current)).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
  });

  it("a chip tap that cannot be answered keeps the sheet on its chips and the list for the last good choice, and says so", async () => {
    let calls = 0;
    const see: SeeFn = async () => (++calls === 1 ? RESULT : Promise.reject(new Error("network")));
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.setKind("tee"));
    await waitFor(() => expect(result.current.lookupFailed).toBe(true));
    expect(result.current.phase.name).toBe("ready");
    expect(result.current.refreshing).toBe(false);
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_a", "lst_b"]);
    expect(result.current.attributes.kind).toBe("tee");
  });

  it("repeating a failed look-up uses the chips as they are now, and clears the failure when it works", async () => {
    let calls = 0;
    const see = vi.fn<SeeFn>(async (req) => (++calls === 2 ? Promise.reject(new Error("network")) : req.attributes === undefined ? RESULT : { ...RESULT, source: "chips", matches: [MATCH("lst_after")] }));
    const { result } = renderHook(() => usePhotoFlow(PICTURE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.setKind("tee"));
    await waitFor(() => expect(result.current.lookupFailed).toBe(true));
    act(() => result.current.retryLookup());
    expect(result.current.lookupFailed).toBe(false);
    await waitFor(() => expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_after"]));
    expect((see.mock.calls[2]?.[0] as SeeRequest).attributes?.kind).toBe("tee");
    expect(result.current.updates).toBe(1);
  });
});
