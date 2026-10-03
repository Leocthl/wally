// The Presenter's DM7 beat (receipts: verify, tamper, restore) on the big screen. In plain words, the default, it shows the plain
// verdict card, "Try changing one receipt" and "Put it back", the banner while a changed copy is up, and the latest receipts as
// words, number, amount and time with no hash and no #seq. Developer mode keeps the card with hashes, the #seq and the hash.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRESENTER_SCRIPT } from "../src/booth/presenterScript";
import { ProofStage } from "../src/screens/presenter/ProofStage";
import { bootApp, type Harness } from "./helpers/app";
import { developerMode } from "./helpers/devMode";
import { bareFigures, numsWithoutChip } from "./helpers/figures";
import { instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 60_000 });

async function stepToProofBeat(h: Harness): Promise<HTMLElement> {
  const target = PRESENTER_SCRIPT.findIndex((s) => s.moment === "DM7");
  for (let i = 0; i <= target; i += 1) {
    const step = screen.getByRole("button", { name: /^Step/ });
    await waitFor(() => expect(step).toBeEnabled());
    await h.user.click(step);
  }
  return waitFor(() => {
    const stage = document.querySelector<HTMLElement>('section[data-view="log"]');
    if (!stage) throw new Error("the proof beat is not on screen yet");
    return stage;
  });
}

const card = (): HTMLElement => document.querySelector<HTMLElement>('section[data-view="log"] .pf-card')!;

describe("Presenter DM7 in plain words", () => {
  it("shows the plain card, check, change and put back, and the latest receipts as words with no hash and no #seq", async () => {
    const h = await bootApp("#/presenter");
    const stage = await stepToProofBeat(h);
    expect(stage).toHaveAttribute("data-mode", "plain");
    expect(card()).toHaveAttribute("data-status", "idle");
    expect(card()).toHaveTextContent("receipts, signed and linked");
    expect(stage.querySelector(".pf-chain")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Verify/ })).toBeNull();

    await h.user.click(screen.getByRole("button", { name: "Check receipts" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(card()).toHaveTextContent(/All \d+ receipts are untouched/);

    const items = [...stage.querySelectorAll<HTMLElement>(".pr-receipt")];
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.querySelector(".pr-receipt__title")?.textContent).toBeTruthy();
      expect(item.querySelector(".pr-receipt__meta")?.textContent).toMatch(/^Receipt \d+/);
    }
    expect(stage.textContent).not.toMatch(/[0-9a-f]{8}/);
    expect(stage.textContent).not.toMatch(/#\d/);
    expect(bareFigures(stage)).toEqual([]);
    expect(numsWithoutChip(stage)).toEqual([]);
  });

  it("changes a copy, flags it with the banner on top of the stage, and puts the original back", async () => {
    const h = await bootApp("#/presenter");
    const stage = await stepToProofBeat(h);
    expect(document.querySelector("[data-tampered-banner]")).toBeNull();
    await h.user.click(screen.getByRole("button", { name: "Try changing one receipt" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent(/Receipt \d+ was changed/);
    const banner = stage.querySelector<HTMLElement>("[data-tampered-banner]")!;
    expect(banner).toBeInTheDocument();
    expect(stage.firstElementChild).toBe(banner);
    expect(banner).toHaveTextContent("You are looking at a changed copy of the receipts. The stored originals are untouched.");
    expect(banner).toHaveTextContent(/On receipt \d+, the cart total went from HK\$259 to HK\$359\./);
    expect(stage.textContent).not.toMatch(/[0-9a-f]{8}/);
    expect(bareFigures(stage)).toEqual([]);
    expect(numsWithoutChip(stage)).toEqual([]);
    expect(screen.queryByRole("button", { name: "Try changing one receipt" })).toBeNull();

    await h.user.click(screen.getByRole("button", { name: "Put it back" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(document.querySelector("[data-tampered-banner]")).toBeNull();
    expect(stage.querySelectorAll(".pr-receipt[data-changed]")).toHaveLength(0);
  });

  it("tags the changed receipt in the latest list when it is one of the latest", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, ["normal"]);
    const { user } = await mountScreen(<ProofStage />, api, { hash: "#/presenter" });
    await user.click(await screen.findByRole("button", { name: "Try changing one receipt" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    const stage = document.querySelector<HTMLElement>('section[data-view="log"]')!;
    const changed = [...stage.querySelectorAll(".pr-receipt")].filter((r) => r.hasAttribute("data-changed"));
    expect(changed).toHaveLength(1);
    expect(changed[0]).toHaveTextContent("Approved");
    expect(changed[0]).toHaveTextContent("Changed");
    expect(changed[0]).toHaveTextContent("HK$359");
    expect(stage.textContent).not.toMatch(/#\d|[0-9a-f]{8}/);
    expect(bareFigures(stage)).toEqual([]);
    expect(numsWithoutChip(stage)).toEqual([]);
  });

  it("restores from the banner too", async () => {
    const h = await bootApp("#/presenter");
    await stepToProofBeat(h);
    await h.user.click(screen.getByRole("button", { name: "Try changing one receipt" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    await h.user.click(screen.getByRole("button", { name: "Restore the original" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(document.querySelector("[data-tampered-banner]")).toBeNull();
  });
});

describe("Presenter DM7 in developer mode", () => {
  it("keeps the card with hashes, Verify receipts, Try to tamper, and the latest receipts with #seq and the hash", async () => {
    developerMode();
    const h = await bootApp("#/presenter");
    const stage = await stepToProofBeat(h);
    expect(stage).not.toHaveAttribute("data-mode");
    expect(card()).toHaveTextContent(/Ready to check \d+ receipts/);
    expect(screen.getByRole("button", { name: /^Verify/ })).toBeInTheDocument();
    expect(stage.querySelector("[data-tampered-banner]")).toBeNull();
    const meta = [...stage.querySelectorAll(".pr-receipt__meta")].map((m) => m.textContent ?? "");
    expect(meta).toHaveLength(5);
    for (const text of meta) expect(text).toMatch(/#\d+ · [0-9a-f]{8}/);
    await h.user.click(screen.getByRole("button", { name: "Try to tamper" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent(/Broken at receipt #\d/);
    expect(stage.querySelector("[data-tampered-banner]")).toBeNull();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });
});
