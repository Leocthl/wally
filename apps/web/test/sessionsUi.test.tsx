// What a visitor and the crew see of private practice wallets: one calm line in About on a phone that has its own wallet,
// and, on the booth Mac's QR panel, a second link to the practice copy that works anywhere (WALLY_PUBLIC_URL).
import { FakeClock } from "@wally/core/testing";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { MockApiClient } from "../src/api/MockApiClient";
import type { LanInfo } from "../src/api/http/lanInfo";
import type { ApiInfo } from "../src/api/types";
import { PhoneQr } from "../src/shell/PhoneQr";
import { screenReady } from "./helpers/app";
import { delegate, emptyClient, mountBare } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 20_000 });

const TOKEN = "0123456789abcdef0123456789abcdef";
const SVG = (mark: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect fill="white" width="10" height="10"/><!--${mark}--></svg>`;
const PUBLIC = "https://wally-dev.vercel.app";
const LAN: LanInfo = { lan: true, token: TOKEN, urls: [`http://192.168.0.6:8787/?t=${TOKEN}`], qrSvg: [SVG("wifi")] };
const WITH_PUBLIC: LanInfo = { ...LAN, publicUrl: PUBLIC, publicQrSvg: SVG("public") };

const info = (sessions: ApiInfo["sessions"]): ApiInfo => ({
  kind: "http",
  judge: { provider: "laya", note: "test" },
  planner: { provider: "local", note: "test" },
  replayed: false,
  realCapture: null,
  features: { ask: false, alternatives: false, compile: "rules", family: false },
  ...(sessions === undefined ? {} : { sessions }),
});
const client = (sessions: ApiInfo["sessions"]) => emptyClient({ kind: "http", info: async () => info(sessions) });

const ENGLISH = "This is your own practice wallet on the booth Mac. Other visitors cannot see it.";

afterEach(() => vi.unstubAllGlobals());

/** The whole app on the instant mock, whose /api/info says what the booth server would say about this visitor's wallet. */
async function openAbout(sessions: ApiInfo["sessions"], locale: "en" | "zh-HK" = "en"): Promise<HTMLElement> {
  window.localStorage.clear();
  if (locale === "zh-HK") window.localStorage.setItem("wally:lang", "zh-HK");
  window.location.hash = "#/budget";
  const mock = new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  const api = delegate(mock, { info: async () => ({ ...(await mock.info()), ...(sessions === undefined ? {} : { sessions }) }) });
  const user = userEvent.setup();
  render(<App api={api} />);
  await screen.findByRole("note");
  await waitFor(async () => expect((await mock.snapshot()).mandate).not.toBeNull());
  await screenReady();
  await user.click(screen.getByRole("button", { name: /About and settings|關於/ }));
  return screen.findByRole("dialog");
}

describe("About, on a phone with a wallet of its own", () => {
  it("says it once, in plain words", async () => {
    const dialog = within(await openAbout("private"));
    expect(await dialog.findByText(ENGLISH)).toBeInTheDocument();
    expect(dialog.getAllByText(ENGLISH)).toHaveLength(1);
  });

  it("says it in Cantonese too", async () => {
    const dialog = within(await openAbout("private", "zh-HK"));
    expect(await dialog.findByText("呢個係你喺展位 Mac 上嘅專屬練習錢包，其他訪客睇唔到。")).toBeInTheDocument();
  });

  it.each([["shared"], [undefined]] as const)("says nothing on the booth Mac (%s) or on a booth without private wallets", async (sessions) => {
    const dialog = within(await openAbout(sessions));
    await dialog.findByText(/How this demo runs/i);
    expect(dialog.queryByText(ENGLISH)).toBeNull();
    expect(dialog.queryByText(/practice wallet/i)).toBeNull();
  });
});

describe("PhoneQr with a practice copy", () => {
  it("adds a second block with its own QR code and the link, under the Wi-Fi block", async () => {
    mountBare(<PhoneQr load={async () => WITH_PUBLIC} />, client("shared"));
    await screen.findByRole("heading", { name: "Open Wally on your phone" });
    const second = await screen.findByRole("heading", { name: "Works anywhere (practice copy, sample shop)" });
    const block = second.closest(".lan-phone__public") as HTMLElement;
    const qr = within(block).getByRole("img", { name: "QR code that opens the practice copy of Wally" });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(qr.getAttribute("src") ?? "")).toContain("public");
    const link = within(block).getByRole("link", { name: PUBLIC });
    expect(link).toHaveAttribute("href", PUBLIC);
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    // the Wi-Fi block is the one it was: its own code and its own pairing link
    const wifi = screen.getAllByRole("img", { name: "QR code that opens Wally on your phone" });
    expect(wifi).toHaveLength(1);
    expect(decodeURIComponent(wifi[0]?.getAttribute("src") ?? "")).toContain("wifi");
  });

  it("is not there without WALLY_PUBLIC_URL", async () => {
    mountBare(<PhoneQr load={async () => LAN} />, client("shared"));
    await screen.findByRole("heading", { name: "Open Wally on your phone" });
    expect(screen.queryByText(/Works anywhere/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("speaks Cantonese in zh-HK", async () => {
    mountBare(<PhoneQr load={async () => WITH_PUBLIC} />, client("shared"), "zh-HK");
    expect(await screen.findByRole("heading", { name: "隨處可用（練習版，示範商店）" })).toBeInTheDocument();
  });

  it("is still shown when the Mac has no network address (the practice copy needs none)", async () => {
    mountBare(<PhoneQr load={async () => ({ ...WITH_PUBLIC, urls: [], qrSvg: [] })} />, client("shared"));
    expect(await screen.findByText(/no network address yet/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Works anywhere (practice copy, sample shop)" })).toBeInTheDocument();
  });
});
