// The SIMULATED chip in the top bar is a button: a tap says in everyday words what it means, Developer mode keeps the engineers'
// sentence, Escape and a tap elsewhere put it away, it is a 44 px target, and the note around it still reads as before.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bootApp } from "./helpers/app";
import { developerMode } from "./helpers/devMode";

const chip = () => screen.getByRole("button", { name: /SIMULATED: what does this mean\?/ });
const tip = () => document.querySelector("[data-sim-tip]");

describe("the SIMULATED chip", () => {
  it("is still the page's one note, and says SIMULATED", async () => {
    await bootApp("#/budget");
    expect(screen.getByRole("note")).toHaveTextContent("SIMULATED");
    expect(screen.getByRole("note")).toHaveTextContent("Simulated. No money moves.");
    expect(chip()).toHaveAttribute("aria-expanded", "false");
    expect(tip()).toBeNull();
  });

  it("explains itself in one everyday sentence when tapped, and again puts it away", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(chip());
    expect(chip()).toHaveAttribute("aria-expanded", "true");
    expect(tip()).toHaveTextContent("The shop and the card are a safe practice version. No real money moves.");
    expect(tip()?.id).toBe(chip().getAttribute("aria-controls"));
    await h.user.click(chip());
    expect(tip()).toBeNull();
  });

  it("goes away with Escape, with a tap anywhere else, and when the screen changes", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(chip());
    await h.user.keyboard("{Escape}");
    expect(tip()).toBeNull();
    await h.user.click(chip());
    await h.user.click(screen.getByRole("heading", { name: "Ideas for you" }));
    expect(tip()).toBeNull();
    await h.user.click(chip());
    window.location.hash = "#/receipts";
    await waitFor(() => expect(tip()).toBeNull());
  });

  it("says it in Chinese when the language is 繁, and keeps the SIMULATED label", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    await h.user.click(screen.getByRole("button", { name: /SIMULATED：呢個係咩意思？/ }));
    expect(tip()).toHaveTextContent("商店同卡都係安全嘅練習版本，唔會有真錢轉移。");
    expect(screen.getByRole("note")).toHaveTextContent("SIMULATED");
  });
});

describe("the SIMULATED chip in Developer mode", () => {
  it("keeps the engineers' sentence about the rail", async () => {
    developerMode();
    const h = await bootApp("#/budget");
    await h.user.click(chip());
    expect(tip()).toHaveTextContent("The rail is SIMULATED. No money moves.");
  });
});
