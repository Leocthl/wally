// Show Wally a photo in the real app on a test client: the camera button and the shortcut in the Ask sheet and the row on Home, the
// sheet that reads a picture (the canvas work is stubbed: jsdom has no canvas), the chips, the four cards with the budget
// badge, and the buy that goes to ask() with the picked listing id. The booth side is the real see() over the bundled shop.
import { FakeClock } from "@wally/core/testing";
import type { Described } from "@wally/agent/vision";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { MockApiClient } from "../src/api/MockApiClient";
import { loadBundle } from "../src/api/local/bundle";
import type { ApiFeatures, ApiInfo, AskRequest, RunSummary, SeeRequest, SeeResult } from "../src/api/types";
import { see } from "../src/booth/backend/see";
import { SILENT_BACKEND_LOGGER } from "../src/booth/backend/types";
import { parseSeeRequest, type JsonObject } from "../src/booth/backend/validate";
import type * as PrepareModule from "../src/screens/photo/prepare";
import { PrepareError, preparePhoto, type Prepared } from "../src/screens/photo/prepare";
import { jpegBase64 } from "./helpers/pictures";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("../src/screens/photo/prepare", async (importOriginal) => ({ ...(await importOriginal<typeof PrepareModule>()), preparePhoto: vi.fn() }));

const SHOP = loadBundle().catalogue.shop;
const PICTURE = jpegBase64();
const PREPARED: Prepared = { blob: new Blob(["jpeg"]), data: PICTURE, width: 768, height: 1024, palette: [{ color: "navy", share: 0.7 }, { color: "white", share: 0.2 }] };

type Pending = { release: (r: SeeResult) => void; fail: (e: unknown) => void };

class PhotoClient extends MockApiClient {
  readonly asked: AskRequest[] = [];
  readonly seen: SeeRequest[] = [];
  readonly mode: "model" | "palette";
  /** What the pretend model reads from a picture. */
  reads: Described["attributes"] = { kind: "hoodie", colors: ["navy"], pattern: "plain", fit: "relaxed", style: ["streetwear"] };
  hold: Pending | null = null;
  failWith: unknown = null;
  readonly #features: Partial<ApiFeatures>;

  /** `announces` false: the booth has see() on its client but says nothing about pictures in features (an older booth server). */
  readonly #announces: boolean;

  constructor(mode: "model" | "palette", features: Partial<ApiFeatures> = {}, announces = true) {
    super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
    this.mode = mode;
    this.#features = features;
    this.#announces = announces;
  }

  override async info(): Promise<ApiInfo> {
    const base = await super.info();
    return { ...base, kind: "http", features: { ask: true, alternatives: false, compile: "rules", family: false, ...(this.#announces ? { see: this.mode } : {}), ...this.#features } };
  }

  async see(req: SeeRequest): Promise<SeeResult> {
    this.seen.push(req);
    if (this.failWith !== null) throw this.failWith;
    const reader = this.mode === "model" ? async (): Promise<Described> => ({ attributes: this.reads, reason: this.reads === null ? "model_unavailable" : "ok", bytes: 9, width: 768, height: 1024, latencyMs: 1, model: "m", failure: null }) : null;
    const done = see(parseSeeRequest(req as JsonObject), { shop: SHOP, reader, logger: SILENT_BACKEND_LOGGER });
    if (req.image === undefined || this.hold === null) return done;
    return new Promise<SeeResult>((resolve, reject) => {
      this.hold = { release: (r) => resolve(r), fail: reject };
    });
  }

  ask(req: AskRequest): Promise<RunSummary> {
    this.asked.push(req);
    return this.runScenario("normal");
  }
}

const prepare = vi.mocked(preparePhoto);
const FILE = new File(["picture"], "look.jpg", { type: "image/jpeg" });

beforeEach(() => {
  prepare.mockReset();
  prepare.mockResolvedValue(PREPARED);
  URL.createObjectURL = vi.fn(() => "blob:picture");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

async function boot(client: MockApiClient, locale: "en" | "zh-HK" = "en") {
  window.localStorage.clear();
  window.localStorage.setItem("wally:lang", locale);
  window.location.hash = "#/budget";
  const user = userEvent.setup();
  render(<App api={client} /> as ReactElement);
  await screen.findByRole("meter");
  return user;
}

const askName = (locale: "en" | "zh-HK"): RegExp => (locale === "en" ? /^Ask$/ : /^問 Wally$/);

/** Opens the Ask sheet and chooses the picture with the camera button's file input. */
async function choosePicture(user: ReturnType<typeof userEvent.setup>, locale: "en" | "zh-HK" = "en") {
  await user.click(screen.getByRole("button", { name: askName(locale) }));
  const ask = await screen.findByRole("dialog");
  const input = ask.querySelector<HTMLInputElement>('input[data-slot="photo-file"]');
  if (input === null) throw new Error("no photo input in the Ask sheet");
  await user.upload(input, FILE);
  return await screen.findByRole("dialog", { name: locale === "en" ? "Show Wally a photo" : "俾 Wally 睇相" });
}

describe("the entry points", () => {
  it("shows the row on Home, and the camera button and the shortcut in the Ask sheet, when the booth can look and ask", async () => {
    const user = await boot(new PhotoClient("palette"));
    expect(document.querySelector('main [data-slot="photo-card"]')).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /^Ask$/ }));
    const ask = await screen.findByRole("dialog");
    expect(within(ask).getAllByRole("button", { name: "Show Wally a photo" })).toHaveLength(2); // the camera button in the field and the pill in the shortcuts
    expect(ask.querySelectorAll('[data-slot="photo-pill"]')).toHaveLength(1);
    expect(ask.querySelectorAll('[data-slot="photo-card"]')).toHaveLength(0); // the row belongs to Home
  });

  it("shows neither on a client with no see(), or one that cannot ask", async () => {
    const user = await boot(new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 }));
    expect(document.querySelector('[data-slot="photo-card"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Ask$/ }));
    const ask = await screen.findByRole("dialog");
    expect(ask.querySelector('[data-slot="photo-button"]')).toBeNull();
    expect(ask.querySelector('[data-slot="photo-pill"]')).toBeNull();
  });

  it("shows nothing on a booth that has see() on the client but says nothing about pictures (an older booth server has no /api/see)", async () => {
    const user = await boot(new PhotoClient("palette", {}, false));
    expect(document.querySelector('[data-slot="photo-card"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Ask$/ }));
    const ask = await screen.findByRole("dialog");
    expect(ask.querySelector('[data-slot="photo-button"]')).toBeNull();
    expect(ask.querySelector('[data-slot="photo-pill"]')).toBeNull();
  });

  it("the input offers the camera or the library: any image, no capture attribute", async () => {
    const user = await boot(new PhotoClient("palette"));
    await user.click(screen.getByRole("button", { name: /^Ask$/ }));
    const input = (await screen.findByRole("dialog")).querySelector<HTMLInputElement>('input[data-slot="photo-file"]');
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).not.toHaveAttribute("capture");
    expect(input).toHaveAttribute("aria-hidden", "true");
  });

  it("the row on Home opens the same sheet", async () => {
    const client = new PhotoClient("palette");
    const user = await boot(client);
    const input = document.querySelector<HTMLInputElement>('main input[data-slot="photo-file"]');
    if (input === null) throw new Error("no input on Budget");
    await user.upload(input, FILE);
    expect(await screen.findByRole("dialog", { name: "Show Wally a photo" })).toBeInTheDocument();
  });
});

describe("with the colour plates only (the booth has no model)", () => {
  it("sends the colours and no picture, says what it knows, and asks for the item type", async () => {
    const client = new PhotoClient("palette");
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await waitFor(() => expect(sheet.querySelector('[data-slot="photo-ready"]')).not.toBeNull());
    expect(client.seen).toEqual([{ palette: PREPARED.palette }]);
    expect(within(sheet).getByText("Wally sees the colours. What is it?")).toBeInTheDocument();
    expect(within(sheet).getByText("Your picture stays on this device and is not saved.")).toBeInTheDocument();
    expect(within(sheet).getByText("Pick the type above to see similar items.")).toBeInTheDocument();
    expect(within(sheet.querySelector<HTMLElement>('[data-slot="photo-plates"]') as HTMLElement).getByRole("button", { name: "navy" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet.querySelector<HTMLElement>('[data-slot="photo-colors"]') as HTMLElement).getByRole("button", { name: "navy" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).queryByRole("radio", { checked: true })).toBeNull();
  });

  it("picking a type shows four cards with a name, the shop, a SIMULATED price and a budget badge", async () => {
    const client = new PhotoClient("palette");
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await user.click(await within(sheet).findByRole("radio", { name: "hoodie" }));
    const cards = await within(sheet).findAllByRole("radio", { name: /hoodie|jacket/i });
    await waitFor(() => expect(within(sheet).getByRole("radiogroup", { name: "Similar in the shop" }).querySelectorAll("[data-listing]")).toHaveLength(4));
    const first = within(sheet).getByRole("radiogroup", { name: "Similar in the shop" }).querySelector<HTMLElement>("[data-listing]");
    expect(first).toHaveAttribute("data-listing", "lst_photoHoodieNavy");
    expect(first?.textContent).toContain("Navy relaxed hoodie");
    expect(first?.textContent).toContain("Demo Outlet");
    expect(first?.textContent).toContain("HK$349");
    expect(first?.textContent).toContain("SIMULATED");
    expect(first?.textContent).toContain("plus shipping");
    expect(first?.textContent).toContain("Fits your budget");
    expect(first?.textContent).toContain("Same type");
    expect(cards.length).toBeGreaterThan(0);
    expect(client.seen.at(-1)).toMatchObject({ attributes: { kind: "hoodie", colors: ["navy", "white"] } });
  });

  it("a card that costs more than is left says so, and stays on the list (the rules decide)", async () => {
    const client = new PhotoClient("palette");
    const user = await boot(client);
    const run = await client.runScenario("normal"); // HK$259 spent, HK$541 left
    expect(run.outcome).toBe("APPROVE");
    await waitFor(() => expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", expect.stringContaining("HK$541")));
    const sheet = await choosePicture(user);
    await user.click(await within(sheet).findByRole("radio", { name: "boots" }));
    const card = await waitFor(() => {
      const found = sheet.querySelector<HTMLElement>('[data-listing="lst_photoBootsBrown"]');
      if (found === null) throw new Error("no boots yet");
      return found;
    });
    expect(card.textContent).toContain("More than is left");
    expect(card).toBeEnabled();
  });

  it("picking a card offers the buy bar; Ask Wally to buy this sends the listing id and shows Wally's screen", async () => {
    const client = new PhotoClient("palette");
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await user.click(await within(sheet).findByRole("radio", { name: "hoodie" }));
    const group = await within(sheet).findByRole("radiogroup", { name: "Similar in the shop" });
    await waitFor(() => expect(group.querySelector("[data-listing]")).not.toBeNull());
    expect(within(sheet).getByText("Tap an item to pick it.")).toBeInTheDocument();
    await user.click(group.querySelector<HTMLElement>('[data-listing="lst_photoHoodieNavy"]') as HTMLElement);
    const bar = await within(sheet).findByText(/Ask Wally to buy: Navy relaxed hoodie/);
    expect(bar).toBeInTheDocument();
    expect(sheet.querySelector('[data-slot="photo-buy"]')?.textContent).toContain("HK$379");
    expect(sheet.querySelector('[data-slot="photo-buy"]')?.textContent).toContain("SIMULATED");
    await user.click(within(sheet).getByRole("button", { name: "Ask Wally to buy this" }));
    await waitFor(() => expect(client.asked).toEqual([{ requestText: "Navy relaxed hoodie from Demo Outlet", locale: "en", listingId: "lst_photoHoodieNavy" }]));
    await waitFor(() => expect(window.location.hash).toBe("#/wally"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Show Wally a photo" })).toBeNull());
  });

  it("the more-details chips change what is asked", async () => {
    const client = new PhotoClient("palette");
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await user.click(await within(sheet).findByRole("radio", { name: "hoodie" }));
    await user.click(within(sheet).getByText("More details"));
    await user.click(within(sheet).getByRole("button", { name: "oversized" }));
    await waitFor(() => expect(client.seen.at(-1)).toMatchObject({ attributes: { kind: "hoodie", fit: "oversized" } }));
    expect(within(sheet).getByRole("button", { name: "oversized" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(sheet).getByRole("button", { name: "oversized" }));
    await waitFor(() => expect(client.seen.at(-1)).toMatchObject({ attributes: { kind: "hoodie", fit: null } }));
  });

  it("the type chips are a radio group that arrows move through", async () => {
    const user = await boot(new PhotoClient("palette"));
    const sheet = await choosePicture(user);
    const tee = await within(sheet).findByRole("radio", { name: "tee" });
    tee.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(sheet).getByRole("radio", { name: "shirt" })).toHaveFocus();
    expect(within(sheet).getByRole("radio", { name: "shirt" })).toBeChecked();
  });
});

describe("with the booth's model", () => {
  it("sends the picture, says what the model read in the person's words, and says where the picture goes", async () => {
    const client = new PhotoClient("model");
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await waitFor(() => expect(sheet.querySelector('[data-slot="photo-ready"]')).not.toBeNull());
    expect(client.seen[0]).toEqual({ image: { mime: "image/jpeg", data: PICTURE }, palette: PREPARED.palette });
    expect(within(sheet).getByText("Wally sees: navy, relaxed hoodie")).toBeInTheDocument();
    expect(within(sheet).getByText("Your picture is read once by the model on the booth Mac and is not saved.")).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "hoodie" })).toBeChecked();
    expect(sheet.querySelectorAll("[data-listing]")).toHaveLength(4);
  });

  it("says Wally is looking while the model reads, and Cancel closes the sheet without a result", async () => {
    const client = new PhotoClient("model");
    client.hold = { release: () => undefined, fail: () => undefined };
    const user = await boot(client);
    const sheet = await choosePicture(user);
    expect(await within(sheet).findByText("Wally is looking")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Show Wally a photo" })).toBeNull());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picture");
  });

  it("not clothing: says so kindly and leaves the chips to pick the type", async () => {
    const client = new PhotoClient("model");
    client.reads = { kind: "not_clothing", colors: ["red"], pattern: "plain", fit: "regular", style: [] };
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await waitFor(() => expect(sheet.querySelector('[data-slot="photo-notice"]')).not.toBeNull());
    expect(sheet.querySelector('[data-slot="photo-notice"]')?.textContent).toContain("That does not look like something to wear.");
    expect(within(sheet).queryByRole("radio", { checked: true })).toBeNull();
    expect(sheet.querySelectorAll("[data-listing]")).toHaveLength(0);
  });

  it("a model that could not read it falls back to the chips with a plain note and no error", async () => {
    const client = new PhotoClient("model");
    client.reads = null;
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await waitFor(() => expect(sheet.querySelector('[data-slot="photo-notice"]')).not.toBeNull());
    expect(sheet.querySelector('[data-slot="photo-notice"]')?.textContent).toContain("Wally could not read this picture, so pick the type yourself.");
    expect(sheet.querySelector('[data-slot="photo-problem"]')).toBeNull();
    await user.click(within(sheet).getByRole("radio", { name: "jacket" }));
    await waitFor(() => expect(sheet.querySelectorAll("[data-listing]").length).toBeGreaterThan(0));
  });

  it("a kind the shop does not sell (a bag) says there is nothing like it yet", async () => {
    const client = new PhotoClient("model");
    client.reads = { kind: "bag", colors: ["black"], pattern: "plain", fit: "regular", style: [] };
    const user = await boot(client);
    const sheet = await choosePicture(user);
    await waitFor(() => expect(sheet.querySelector('[data-slot="photo-ready"]')).not.toBeNull());
    expect(within(sheet).getByText("Nothing like this in the shop yet. Try another type.")).toBeInTheDocument();
  });
});

describe("when something goes wrong", () => {
  it("a file that cannot be read says so and offers another picture", async () => {
    prepare.mockRejectedValue(new PrepareError("unreadable"));
    const user = await boot(new PhotoClient("palette"));
    const sheet = await choosePicture(user);
    expect(await within(sheet).findByText("That file could not be read as a picture.")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Choose another picture" })).toBeInTheDocument();
  });

  it("a picture that is too large says so", async () => {
    prepare.mockRejectedValue(new PrepareError("too_large"));
    const user = await boot(new PhotoClient("palette"));
    const sheet = await choosePicture(user);
    expect(await within(sheet).findByText("That picture is too large.")).toBeInTheDocument();
  });

  it("a booth that does not answer says Wally could not look, and Try again looks again", async () => {
    const client = new PhotoClient("palette");
    client.failWith = new Error("network");
    const user = await boot(client);
    const sheet = await choosePicture(user);
    expect(await within(sheet).findByText("Wally could not look just now.")).toBeInTheDocument();
    client.failWith = null;
    await user.click(within(sheet).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(sheet.querySelector('[data-slot="photo-ready"]')).not.toBeNull());
  });
});

describe("in Chinese", () => {
  it("words the sheet, the chips and the cards in 繁體 and sends the same pick", async () => {
    const client = new PhotoClient("palette");
    const user = await boot(client, "zh-HK");
    const sheet = await choosePicture(user, "zh-HK");
    await waitFor(() => expect(sheet.querySelector('[data-slot="photo-ready"]')).not.toBeNull());
    expect(within(sheet).getByText("Wally 見到顏色。係乜嘢款式？")).toBeInTheDocument();
    expect(within(sheet).getByText("你的相片只留喺呢部裝置，唔會儲存。")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("radio", { name: "衛衣" }));
    const first = await waitFor(() => {
      const found = sheet.querySelector<HTMLElement>('[data-listing="lst_photoHoodieNavy"]');
      if (found === null) throw new Error("no card yet");
      return found;
    });
    expect(first.textContent).toContain("海軍藍寬鬆衛衣");
    expect(first.textContent).toContain("同類型");
    await user.click(first);
    await user.click(within(sheet).getByRole("button", { name: "叫 Wally 買呢件" }));
    await waitFor(() => expect(client.asked[0]).toMatchObject({ locale: "zh-HK", listingId: "lst_photoHoodieNavy", requestText: "Demo Outlet 的海軍藍寬鬆衛衣" }));
  });
});
