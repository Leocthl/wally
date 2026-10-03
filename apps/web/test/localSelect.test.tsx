// Client selection at start-up: ?api=local or VITE_API=local forces on-device mode with no network call; otherwise
// the booth server is asked for /api/info and used when it answers as the server; anything else (no server, a static
// host, a timeout, an odd answer) falls back to on-device mode, never to the mock. The note says so, calmly.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ON_DEVICE_NOTE } from "../src/api/local/info";
import { OnDeviceNote } from "../src/api/local/OnDeviceNote";
import { localForced, mockForced, selectApi } from "../src/api/local/select";

const probeOf = (answer: unknown) => vi.fn(() => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)));

describe("mockForced", () => {
  it("is only for ?api=mock, and never reaches the network", () => {
    expect(mockForced("?api=mock")).toBe(true);
    expect(mockForced("?x=1&api=mock")).toBe(true);
    for (const search of ["", "?api=local", "?api=http", "?api=mocking", "?mock=1"]) expect(mockForced(search), search).toBe(false);
  });
});

describe("localForced", () => {
  it.each([
    ["?api=local", undefined, true],
    ["", "local", true],
    ["?api=http", "local", false],
    ["?api=mock", undefined, false],
    ["", undefined, false],
    ["?x=1&api=local", "http", true],
  ] as const)("search %s with VITE_API %s -> %s", (search, env, forced) => {
    expect(localForced(search, env)).toBe(forced);
  });
});

describe("selectApi", () => {
  it("forced on-device mode never touches the network", async () => {
    const probe = probeOf({ kind: "http" });
    expect(await selectApi({ search: "?api=local", env: undefined, probe })).toEqual({ kind: "local", reason: "forced" });
    expect(probe).not.toHaveBeenCalled();
  });

  it("uses the booth server when /api/info answers as the server", async () => {
    expect(await selectApi({ search: "", env: undefined, probe: probeOf({ kind: "http", replayed: false }) })).toEqual({ kind: "http", reason: "server" });
  });

  it.each([
    ["no server", new TypeError("Failed to fetch")],
    ["a timeout", new DOMException("timed out", "TimeoutError")],
    ["a non-JSON or failed answer", null],
    ["an answer that is not the server", { kind: "mock" }],
    ["a page instead of JSON", "<!doctype html>"],
  ])("falls back to on-device mode on %s", async (_name, answer) => {
    expect(await selectApi({ search: "", env: undefined, probe: probeOf(answer) })).toEqual({ kind: "local", reason: "no-server" });
  });
});

describe("OnDeviceNote", () => {
  it("says plainly that this is a demo on the phone with sample shop data and nothing leaves it, in both languages", () => {
    render(<OnDeviceNote />);
    const note = screen.getByText(ON_DEVICE_NOTE);
    expect(note.closest("[data-api-mode]")).toHaveAttribute("data-api-mode", "local");
    expect(note.closest("[data-api-mode]")?.querySelector('[lang="zh-HK"]')?.textContent).toBe("示範模式：Wally 在這部裝置上運作，使用示範商店資料。任何內容都不會離開這部裝置。");
    // A shopper's words: no "recorded answers" (it reads as a pretend AI), and no "on-device mode" jargon.
    expect(note.textContent).not.toMatch(/recorded|on-device/i);
  });
});
