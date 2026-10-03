// The photo flow as state: prepare on the phone, ask the booth to look, keep the matches in step with the chips. Fake
// picture preparation and a fake booth: no canvas, no network. Covers what is sent (the picture only when the booth has a
// model), stale answers, cancel, and every failure ending in a state the screen can word.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, SeeRequest, SeeResult } from "../src/api/types";
import { PrepareError, type Prepared } from "../src/screens/photo/prepare";
import { usePhotoFlow, type PhotoDeps } from "../src/screens/photo/usePhotoFlow";

const FILE = new File(["x"], "look.jpg", { type: "image/jpeg" });
const PREPARED: Prepared = { blob: new Blob(["jpeg"]), data: "AAAA", width: 768, height: 1024, palette: [{ color: "navy", share: 0.7 }, { color: "white", share: 0.2 }] };
const MATCH = (id: string) => ({ listingId: id, kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: [], merchantName: "Demo Outlet (SIMULATED)", priceMinor: 34_900, totalMinor: 37_900, score: 90, reasons: ["same_kind"] }) as const;
const RESULT: SeeResult = { source: "model", attributes: { kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: ["streetwear"] }, palette: PREPARED.palette, matches: [MATCH("lst_a"), MATCH("lst_b")] };

type SeeFn = NonNullable<ApiClient["see"]>;
const fakeApi = (see: SeeFn | undefined): ApiClient => ({ see }) as unknown as ApiClient;

function deps(see: SeeFn | undefined, patch: Partial<PhotoDeps> = {}): PhotoDeps {
  return { api: fakeApi(see), mode: "model", prepare: async () => PREPARED, createUrl: () => "blob:picture", revokeUrl: () => undefined, debounceMs: 5, ...patch };
}

afterEach(() => vi.restoreAllMocks());

describe("usePhotoFlow", () => {
  it("is idle with no file", () => {
    const { result } = renderHook(() => usePhotoFlow(null, deps(async () => RESULT)));
    expect(result.current.phase.name).toBe("idle");
    expect(result.current.matches).toEqual([]);
  });

  it("prepares, looks, and settles with what the booth read", async () => {
    const see = vi.fn<SeeFn>(async () => RESULT);
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect(result.current.attributes).toEqual(RESULT.attributes);
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_a", "lst_b"]);
    expect(result.current.pictureUrl).toBe("blob:picture");
    expect(result.current.mode).toBe("model");
    expect(see).toHaveBeenCalledTimes(1);
  });

  it("sends the picture only when the booth has a model, and the colour plates always", async () => {
    const withModel = vi.fn<SeeFn>(async () => RESULT);
    const a = renderHook(() => usePhotoFlow(FILE, deps(withModel, { mode: "model" })));
    await waitFor(() => expect(a.result.current.phase.name).toBe("ready"));
    expect(withModel.mock.calls[0]?.[0]).toEqual({ image: { mime: "image/jpeg", data: "AAAA" }, palette: PREPARED.palette });

    const palette = vi.fn<SeeFn>(async () => ({ ...RESULT, source: "palette", matches: [] }));
    const b = renderHook(() => usePhotoFlow(FILE, deps(palette, { mode: "palette" })));
    await waitFor(() => expect(b.result.current.phase.name).toBe("ready"));
    expect(palette.mock.calls[0]?.[0]).toEqual({ palette: PREPARED.palette });
    expect(JSON.stringify(palette.mock.calls[0]?.[0])).not.toContain("AAAA");
  });

  it("shows looking while the booth reads, with the picture already on screen", async () => {
    let release: (r: SeeResult) => void = () => undefined;
    const see: SeeFn = () => new Promise<SeeResult>((resolve) => (release = resolve));
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("looking"));
    expect(result.current.pictureUrl).toBe("blob:picture");
    await act(async () => release(RESULT));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
  });

  it("a run of chip taps asks once, with the final words, and the old list stays until the new one arrives", async () => {
    const see = vi.fn<SeeFn>(async (req: SeeRequest) => (req.attributes === undefined ? RESULT : { ...RESULT, source: "chips", attributes: { ...RESULT.attributes, ...req.attributes } as SeeResult["attributes"], matches: [MATCH("lst_c")] }));
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => {
      result.current.setKind("jacket");
      result.current.toggleColor("white");
      result.current.setFit("slim");
    });
    expect(result.current.refreshing).toBe(true);
    expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_a", "lst_b"]);
    await waitFor(() => expect(result.current.matches.map((m) => m.listingId)).toEqual(["lst_c"]));
    expect(see).toHaveBeenCalledTimes(2);
    expect(see.mock.calls[1]?.[0]).toEqual({ attributes: { kind: "jacket", colors: ["navy", "white"], pattern: "plain", fit: "slim", style: ["streetwear"] }, palette: PREPARED.palette });
    expect(result.current.refreshing).toBe(false);
  });

  it("ignores a slow answer to an old tap", async () => {
    const waiting: ((r: SeeResult) => void)[] = [];
    const see = vi.fn<SeeFn>((req) => (req.attributes === undefined ? Promise.resolve(RESULT) : new Promise<SeeResult>((resolve) => waiting.push(resolve))));
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
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
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.setKind("hoodie"));
    await new Promise((r) => setTimeout(r, 30));
    expect(see).toHaveBeenCalledTimes(1);
  });

  it("picks one card, picks it off again, and forgets a pick the new list no longer has", async () => {
    const see: SeeFn = async (req) => (req.attributes === undefined ? RESULT : { ...RESULT, matches: [MATCH("lst_b")] });
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
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
    const { result, rerender } = renderHook(({ file }: { file: File | null }) => usePhotoFlow(file, deps(see, { revokeUrl: revoke })), { initialProps: { file: FILE as File | null } });
    await waitFor(() => expect(result.current.phase.name).toBe("looking"));
    rerender({ file: null });
    expect(result.current.phase.name).toBe("idle");
    expect(revoke).toHaveBeenCalledWith("blob:picture");
    await act(async () => release(RESULT));
    expect(result.current.phase.name).toBe("idle");
    expect(result.current.matches).toEqual([]);
  });

  it("a new file starts a fresh look", async () => {
    const see = vi.fn<SeeFn>(async () => RESULT);
    const { result, rerender } = renderHook(({ file }: { file: File }) => usePhotoFlow(file, deps(see)), { initialProps: { file: FILE } });
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.pick("lst_a"));
    rerender({ file: new File(["y"], "other.jpg", { type: "image/jpeg" }) });
    await waitFor(() => expect(see).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    expect(result.current.pickedId).toBeNull();
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
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see as SeeFn, patch)));
    await waitFor(() => expect(problem(result.current)).toBe(expected));
  });

  it("a client without see() is a failure, not a crash", async () => {
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(undefined)));
    await waitFor(() => expect(problem(result.current)).toBe("failed"));
  });

  it("try again looks again", async () => {
    let calls = 0;
    const see: SeeFn = async () => (++calls === 1 ? Promise.reject(new Error("network")) : RESULT);
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
    await waitFor(() => expect(problem(result.current)).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
  });

  it("a chip tap that cannot be answered is a failure the screen can word", async () => {
    let calls = 0;
    const see: SeeFn = async () => (++calls === 1 ? RESULT : Promise.reject(new Error("network")));
    const { result } = renderHook(() => usePhotoFlow(FILE, deps(see)));
    await waitFor(() => expect(result.current.phase.name).toBe("ready"));
    act(() => result.current.setKind("tee"));
    await waitFor(() => expect(problem(result.current)).toBe("failed"));
  });
});
