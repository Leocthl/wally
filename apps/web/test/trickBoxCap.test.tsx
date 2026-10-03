// "Product specifications" stops where the real limit does. A listing record's text holds 4,000 characters at most
// (schemas/listing-record.schema.json); the box used to take 20,000, so a long paste got as far as the run and ended as "No card
// was made". Now the box stops at 4,000, and from 90 percent of it a small counter shows how much room is left: silent to a
// screen reader while typing, said once when it appears and once when the limit is reached.
import { FakeClock } from "@wally/core/testing";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { MockApiClient } from "../src/api/MockApiClient";
import type { ApiInfo, ProposeRequest, RunSummary } from "../src/api/types";
import { LISTING_TEXT_HARD_CAP } from "../src/booth/scenarios";

vi.setConfig({ testTimeout: 30_000 });

/** A booth with a live judge: the only host where the trick box takes the visitor's own text. */
class TrickClient extends MockApiClient {
  readonly proposed: ProposeRequest[] = [];

  constructor() {
    super({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  }

  override async info(): Promise<ApiInfo> {
    const base = await super.info();
    return { ...base, kind: "http", judge: { provider: "laya", note: "" }, planner: { provider: "rule", note: "" }, features: { ask: false, alternatives: false, compile: "rules", family: false } };
  }

  override async propose(req: ProposeRequest): Promise<RunSummary> {
    this.proposed.push(req);
    return this.runScenario("normal");
  }
}

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

async function openTrick(locale: "en" | "zh-HK" = "en") {
  const client = new TrickClient();
  window.localStorage.clear();
  window.localStorage.setItem("wally:lang", locale);
  window.localStorage.setItem("wally:demo-open", "1");
  window.location.hash = "#/budget";
  const user = userEvent.setup();
  render(<App api={client} /> as ReactElement);
  await screen.findByRole("meter");
  await user.click(screen.getByRole("button", { name: locale === "en" ? /^Ask$/ : /^問 Wally$/ }));
  const ask = await screen.findByRole("dialog");
  const box = within(ask).getByRole("textbox", { name: locale === "en" ? /Product specifications/ : /產品規格/ }) as HTMLTextAreaElement;
  await user.click(box);
  return { client, user, ask, box };
}

const counter = (ask: HTMLElement): HTMLElement | null => ask.querySelector<HTMLElement>("[data-trick-count]");
const said = (ask: HTMLElement): string => ask.querySelector("[data-trick-count-live]")?.textContent ?? "";

describe("the cap is the listing record's own: 4,000 characters", () => {
  it("is 4,000", () => {
    expect(LISTING_TEXT_HARD_CAP).toBe(4_000);
  });

  it("cuts a 4,001-character paste to 4,000", async () => {
    const { user, box } = await openTrick();
    expect(box).toHaveAttribute("maxlength", "4000");
    await user.paste("a".repeat(4_001));
    expect(box.value).toHaveLength(4_000);
  });

  it("sends a full box whole, and never more than 4,000 characters", async () => {
    const { client, user, ask } = await openTrick();
    await user.paste("b".repeat(4_000));
    await user.click(within(ask).getByRole("button", { name: /Send to Wally/ }));
    expect(client.proposed).toHaveLength(1);
    expect(client.proposed[0]!.listingText).toBe("b".repeat(4_000));
  });
});

describe("the counter near the limit", () => {
  it("is not there while the text is under 90 percent of the cap", async () => {
    const { user, ask } = await openTrick();
    expect(counter(ask)).toBeNull();
    await user.paste("a".repeat(3_599));
    expect(counter(ask)).toBeNull();
    expect(said(ask)).toBe("");
  });

  it("appears at 90 percent with the figures, follows the text, and goes when the text is cut back", async () => {
    const { user, ask, box } = await openTrick();
    await user.paste("a".repeat(3_599));
    await user.paste("a");
    expect(counter(ask)).toHaveTextContent("3,600 / 4,000 characters");
    expect(counter(ask)).toHaveAttribute("data-level", "near");
    await user.paste("a".repeat(120));
    expect(counter(ask)).toHaveTextContent("3,720 / 4,000 characters");
    // Cut back under 90 percent: the counter goes again.
    await user.clear(box);
    await user.paste("a".repeat(100));
    expect(counter(ask)).toBeNull();
  });

  it("says the limit is reached at 4,000, in words as well as colour", async () => {
    const { user, ask } = await openTrick();
    await user.paste("a".repeat(4_001));
    const count = counter(ask)!;
    expect(count).toHaveTextContent("4,000 / 4,000 characters");
    expect(count).toHaveTextContent("Limit reached");
    expect(count).toHaveAttribute("data-level", "full");
  });

  it("is said to a screen reader once when it appears and once at the limit, not on every key", async () => {
    const { user, ask } = await openTrick();
    const live = ask.querySelector("[data-trick-count-live]")!;
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveAttribute("aria-atomic", "true");
    // The Ask sheet keeps exactly one status region (the voice line); this one is a plain live region.
    expect(live).not.toHaveAttribute("role");
    expect(said(ask)).toBe("");
    await user.paste("a".repeat(3_600));
    const near = said(ask);
    expect(near).toBe("Close to the limit of 4,000 characters.");
    // Every key between 90 percent and the limit leaves the spoken text as it was.
    for (const more of [1, 1, 50, 300]) {
      await user.paste("a".repeat(more));
      expect(said(ask)).toBe(near);
    }
    await user.paste("a".repeat(100));
    expect(said(ask)).toBe("Limit reached: 4,000 characters at most.");
    // The figure itself is not a live region: it changes with every key.
    expect(counter(ask)?.closest("[aria-live]")).toBeNull();
    expect(counter(ask)).not.toHaveAttribute("aria-live");
  });

  it("reads in 繁體: 字, and the limit in Chinese", async () => {
    const { user, ask } = await openTrick("zh-HK");
    await user.paste("a".repeat(3_720));
    expect(counter(ask)).toHaveTextContent("3,720 / 4,000 字");
    expect(said(ask)).toBe("就快去到 4,000 字上限。");
    await user.paste("a".repeat(400));
    expect(counter(ask)).toHaveTextContent("4,000 / 4,000 字");
    expect(counter(ask)).toHaveTextContent("已去到上限");
    expect(said(ask)).toBe("已去到上限：最多 4,000 字。");
  });
});
