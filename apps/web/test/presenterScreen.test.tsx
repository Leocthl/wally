// Presenter (docs/06): the Driver steps DM1 to DM9; the big screen shows the beat; Reset returns to step 0 in SIMULATED.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRESENTER_SCRIPT } from "../src/booth/presenterScript";
import { bootApp } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

vi.setConfig({ testTimeout: 30_000 });

const step = () => screen.getByRole("button", { name: /^Step/ });
async function stepTo(h: Awaited<ReturnType<typeof bootApp>>, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await waitFor(() => expect(step()).toBeEnabled());
    await h.user.click(step());
  }
}

describe("presenter walk", () => {
  it("scripts the canonical beats in order, DM1 to DM9", () => {
    const moments = PRESENTER_SCRIPT.map((s) => s.moment);
    expect(moments).toEqual(["DM1", "DM2", "DM2", "DM2", "DM3", "DM4", "DM5", "DM6", "DM7", "DM8", "DM9"]);
    expect(PRESENTER_SCRIPT.filter((s) => s.optional).map((s) => s.moment)).toEqual(["DM6"]);
  });

  it("DM1 seals M0; DM2 mints, declines the overshoot, charges exactly, and declines the replay", async () => {
    const h = await bootApp("#/presenter");
    await stepTo(h, 1);
    await waitFor(() => expect(screen.getByRole("region", { name: "Sealed mandate" })).toBeInTheDocument());
    await stepTo(h, 1); // mint
    await waitFor(() => expect(document.querySelector('[data-card-state="ACTIVE"]')).not.toBeNull());
    await stepTo(h, 1); // overshoot
    await waitFor(() => expect(document.querySelector('[data-decline="OVER_LIMIT"]')).not.toBeNull());
    await stepTo(h, 1); // exact charge, then replay
    await waitFor(() => expect(document.querySelector('[data-decline="CARD_USED"]')).not.toBeNull());
    expect(document.querySelector('[data-card-state="USED"]')).not.toBeNull();
  });

  it("DM3 to DM5 show the three live stops, each with its banner", async () => {
    const h = await bootApp("#/presenter");
    await stepTo(h, 4);
    await stepTo(h, 1);
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => /STOPPED R9/.test(a.textContent ?? ""))).toBe(true));
    await stepTo(h, 1);
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => /Total HK\$550/.test(a.textContent ?? ""))).toBe(true));
    await stepTo(h, 1);
    await waitFor(() => expect(screen.getAllByRole("alert").some((a) => /STOPPED R10/.test(a.textContent ?? ""))).toBe(true));
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
  });

  it("can skip the optional DM6 and carries on to the log", async () => {
    const h = await bootApp("#/presenter");
    await stepTo(h, 7);
    expect(screen.getByText("DM6")).toBeInTheDocument();
    await h.user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("DM7")).toBeInTheDocument();
    await stepTo(h, 1);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Verify/ })).toBeInTheDocument());
  });

  it("Reset returns to DM1, SIMULATED, an HK$800 packet and no cards", async () => {
    const h = await bootApp("#/presenter");
    await stepTo(h, 3);
    await h.user.click(screen.getByRole("button", { name: /^Reset/ }));
    await waitFor(() => expect(screen.getByText("DM1")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", expect.stringContaining("HK$800 left")));
    expect(document.querySelector("[data-card-state]")).toBeNull();
    expect(screen.getByRole("radio", { name: /SIMULATED/ })).toBeChecked();
  });

  it("shows the rail badge and the packet in the big layout with the PresenterBar at the bottom", async () => {
    await bootApp("#/presenter");
    expect(screen.getByRole("note")).toHaveTextContent("SIMULATED rail");
    expect(screen.getByRole("navigation", { name: "Presenter controls" })).toBeInTheDocument();
    expect(document.querySelector(".packet-meter--l")).not.toBeNull();
  });
});
