// The LAN screens: "Open Wally on your phone" (QR and link, booth Mac in LAN mode only) and "Connect to the booth Mac"
// (native app only: reads and checks the pasted link, asks the Mac, then saves and reloads). Nothing shows otherwise.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SERVER_KEY, TOKEN_KEY } from "../src/api/http/connection";
import type { LanInfo } from "../src/api/http/lanInfo";
import type { ApiInfo } from "../src/api/types";
import { BoothConnect } from "../src/shell/BoothConnect";
import { PhoneQr } from "../src/shell/PhoneQr";
import { bootApp } from "./helpers/app";
import { emptyClient, mountBare } from "./helpers/proofHarness";

const TOKEN = "0123456789abcdef0123456789abcdef";
const LINK = `http://192.168.0.6:8787/?t=${TOKEN}`;
const SVG = (mark: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect fill="white" width="10" height="10"/><!--${mark}--></svg>`;
const LAN: LanInfo = { lan: true, token: TOKEN, urls: [LINK, `http://booth-mac.local:8787/?t=${TOKEN}`], qrSvg: [SVG("a"), SVG("b")] };

const httpInfo = (kind: "http" | "local"): ApiInfo => ({ kind, judge: { provider: "laya", note: "test" }, planner: { provider: "local", note: "test" }, replayed: false, realCapture: null, features: { ask: false, alternatives: false, compile: "rules", family: false } });
const liveClient = () => emptyClient({ kind: "http", info: async () => httpInfo("http") });

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete (window as { Capacitor?: unknown }).Capacitor;
  vi.unstubAllGlobals();
});

describe("PhoneQr", () => {
  it("shows the heading, the LAN chip, the QR image, the note and the links in English", async () => {
    mountBare(<PhoneQr load={async () => LAN} />, liveClient());
    expect(await screen.findByRole("heading", { name: "Open Wally on your phone" })).toBeInTheDocument();
    expect(screen.getByText("LAN mode is ON")).toBeInTheDocument();
    expect(screen.getByText(/Same Wi-Fi as this Mac\./)).toBeInTheDocument();
    const qr = screen.getByRole("img", { name: "QR code that opens Wally on your phone" });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(screen.getByRole("button", { name: LAN.urls[0] ?? "" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: LAN.urls[1] ?? "" })).toHaveAttribute("aria-pressed", "false");
  });

  it("speaks Cantonese in zh-HK", async () => {
    mountBare(<PhoneQr load={async () => LAN} />, liveClient(), "zh-HK");
    expect(await screen.findByRole("heading", { name: "喺你部手機打開 Wally" })).toBeInTheDocument();
    expect(screen.getByText("區域網絡模式已開啟")).toBeInTheDocument();
  });

  it("switches the code to the link a person taps", async () => {
    const user = userEvent.setup();
    mountBare(<PhoneQr load={async () => LAN} />, liveClient());
    const before = (await screen.findByRole("img")).getAttribute("src");
    await user.click(screen.getByRole("button", { name: LAN.urls[1] ?? "" }));
    expect(screen.getByRole("img").getAttribute("src")).not.toBe(before);
    expect(screen.getByRole("button", { name: LAN.urls[1] ?? "" })).toHaveAttribute("aria-pressed", "true");
  });

  it("copies the chosen link and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...window.navigator, clipboard: { writeText } });
    mountBare(<PhoneQr load={async () => LAN} />, liveClient());
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("says when this Mac has no network address", async () => {
    mountBare(<PhoneQr load={async () => ({ ...LAN, urls: [], qrSvg: [] })} />, liveClient());
    expect(await screen.findByText(/no network address yet/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders nothing when the server says 404 (LAN mode off, or this page is not on the Mac)", async () => {
    const load = vi.fn(async () => null);
    const view = mountBare(<PhoneQr load={load} />, liveClient());
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(view.container.querySelector(".lan-phone")).toBeNull();
    expect(screen.queryByText("Open Wally on your phone")).toBeNull();
  });

  it("does not even ask in on-device mode", async () => {
    const load = vi.fn(async () => LAN);
    const view = mountBare(<PhoneQr load={load} />, emptyClient({ kind: "local" }));
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(view.container.querySelector(".lan-phone")).toBeNull();
  });
});

describe("BoothConnect", () => {
  const field = () => screen.getByLabelText("Link from the booth screen");

  it("is not there in a browser", () => {
    const view = mountBare(<BoothConnect native={false} />, liveClient());
    expect(view.container.querySelector("#about-booth")).toBeNull();
    expect(screen.queryByText("Connect to the booth Mac")).toBeNull();
  });

  it("refuses an empty field and a link to a public address, and asks nothing", async () => {
    const user = userEvent.setup();
    const probe = vi.fn();
    mountBare(<BoothConnect native probe={probe} reload={vi.fn()} />, liveClient());
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText("Paste the link first.")).toBeInTheDocument();
    await user.type(field(), "http://example.com/?t=0123456789abcdef");
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText(/Only a Mac on your own network works/)).toBeInTheDocument();
    expect(probe).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SERVER_KEY)).toBeNull();
  });

  it.each([
    ["ftp://192.168.0.6/", /must start with http/],
    ["http://me:pw@192.168.0.6:8787/", /user name and password/],
    ["http://192.168.0.6:8787/?t=short", /pairing code in the link is not valid/],
  ])("explains %s", async (text, message) => {
    const user = userEvent.setup();
    mountBare(<BoothConnect native probe={vi.fn()} reload={vi.fn()} />, liveClient());
    await user.type(field(), text);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("asks the Mac with the token and, on its answer, saves the address and the token and reloads", async () => {
    const user = userEvent.setup();
    const probe = vi.fn(async () => httpInfo("http"));
    const reload = vi.fn();
    mountBare(<BoothConnect native probe={probe} reload={reload} />, liveClient());
    await user.type(field(), LINK);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(probe).toHaveBeenCalledWith("http://192.168.0.6:8787", TOKEN, expect.any(Number));
    expect(window.localStorage.getItem(SERVER_KEY)).toBe("http://192.168.0.6:8787");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(TOKEN);
  });

  it("saves nothing when the Mac answers no, or does not answer", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const probe = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mountBare(<BoothConnect native probe={probe} reload={reload} />, liveClient());
    await user.type(field(), LINK);
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText(/did not accept the pairing code/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect" }));
    expect(await screen.findByText(/No answer\. Check the phone is on the same Wi-Fi/)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SERVER_KEY)).toBeNull();
  });

  it("shows the saved Mac as live and disconnects back to on-device mode", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(SERVER_KEY, "http://192.168.0.6:8787");
    window.localStorage.setItem(TOKEN_KEY, TOKEN);
    const reload = vi.fn();
    mountBare(<BoothConnect native reload={reload} />, liveClient());
    expect(await screen.findByText("Live on 192.168.0.6:8787")).toBeInTheDocument();
    expect(screen.queryByLabelText("Link from the booth screen")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SERVER_KEY)).toBeNull();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("says so when the saved Mac is not answering and the app runs on the device", async () => {
    window.localStorage.setItem(SERVER_KEY, "http://192.168.0.6:8787");
    mountBare(<BoothConnect native reload={vi.fn()} />, emptyClient({ kind: "local", info: async () => httpInfo("local") }));
    expect(await screen.findByText(/192\.168\.0\.6:8787 is saved but not answering/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });
});

describe("About sheet", () => {
  async function openAbout(): Promise<ReturnType<typeof within>> {
    const h = await bootApp();
    await h.user.click(screen.getByRole("button", { name: "About and settings" }));
    return within(await screen.findByRole("dialog"));
  }

  it("has no connect row and no phone panel in a browser on the mock", async () => {
    const sheet = await openAbout();
    expect(sheet.getByText("How this demo runs")).toBeInTheDocument();
    expect(sheet.queryByText("Connect to the booth Mac")).toBeNull();
    expect(sheet.queryByText("Open Wally on your phone")).toBeNull();
  });

  it("has the connect row in the native app", async () => {
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    const sheet = await openAbout();
    expect(sheet.getByRole("heading", { name: "Connect to the booth Mac" })).toBeInTheDocument();
    expect(sheet.getByLabelText("Link from the booth screen")).toBeInTheDocument();
  });
});
