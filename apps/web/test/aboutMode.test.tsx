// The "Show technical details" switch in About: off by default, one line saying what it does, flips every screen to the
// developer view and back, is remembered, and brings the booth's technical notes with it.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODE_KEY } from "../src/state/displayMode";
import { bootApp } from "./helpers/app";
import { developerMode } from "./helpers/devMode";

vi.setConfig({ testTimeout: 20_000 });

async function openAbout(): Promise<{ readonly user: Awaited<ReturnType<typeof bootApp>>["user"]; readonly sheet: HTMLElement }> {
  const h = await bootApp("#/budget");
  await h.user.click(screen.getByRole("button", { name: /About and settings/ }));
  return { user: h.user, sheet: await screen.findByRole("dialog", { name: "About Wally" }) };
}

describe("About: Show technical details", () => {
  it("is a labelled switch, off by default, with a line saying what it is for", async () => {
    const { sheet } = await openAbout();
    const control = within(sheet).getByRole("switch", { name: "Show technical details" });
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(sheet).toHaveTextContent("For engineers: exact counts, intervals, rule ids and fingerprints.");
    expect(control).toHaveAccessibleDescription(/For engineers/);
  });

  it("keeps the booth's technical notes out of plain mode", async () => {
    const { sheet } = await openAbout();
    expect(within(sheet).queryByText("Technical notes")).toBeNull();
    expect(within(sheet).getByText("Offline demo in this browser")).toBeInTheDocument();
  });

  it("turning it on remembers the choice and brings the technical notes", async () => {
    const { user, sheet } = await openAbout();
    await user.click(within(sheet).getByRole("switch", { name: "Show technical details" }));
    await waitFor(() => expect(within(sheet).getByRole("switch", { name: "Show technical details" })).toHaveAttribute("aria-checked", "true"));
    expect(window.localStorage.getItem(MODE_KEY)).toBe("developer");
    expect(within(sheet).getByText("Technical notes")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("switch", { name: "Show technical details" }));
    expect(window.localStorage.getItem(MODE_KEY)).toBe("plain");
    expect(within(sheet).queryByText("Technical notes")).toBeNull();
  });

  it("starts on when the address says ?dev=1, and turning it off takes the override out of the address", async () => {
    developerMode();
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("button", { name: /About and settings/ }));
    const sheet = await screen.findByRole("dialog", { name: "About Wally" });
    const control = within(sheet).getByRole("switch", { name: "Show technical details" });
    expect(control).toHaveAttribute("aria-checked", "true");
    await h.user.click(control);
    expect(within(sheet).getByRole("switch", { name: "Show technical details" })).toHaveAttribute("aria-checked", "false");
    expect(window.location.search).toBe("");
  });

  it("speaks 繁 when chosen", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("button", { name: /About and settings/ }));
    const sheet = await screen.findByRole("dialog", { name: "About Wally" });
    await h.user.click(within(sheet).getAllByRole("radio", { name: "繁體中文" })[0]!);
    const zh = await screen.findByRole("dialog", { name: "關於 Wally" });
    expect(within(zh).getByRole("switch", { name: "顯示技術細節" })).toBeInTheDocument();
  });
});
