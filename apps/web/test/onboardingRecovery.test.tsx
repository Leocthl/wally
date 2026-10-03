// The first run never leaves a visitor without a budget, and never uses up the first run by failing: a step that throws, a
// booth that does not answer or refuses the ready-made budget, a Retry in the middle of setup, a cleared date.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelloStepProps } from "../src/screens/onboarding/HelloStep";
import { ONBOARDED_KEY } from "../src/state/profile";
import { FirstLoadFails, FirstSealFails } from "./helpers/shellClients";
import { hello, openFirstRun, skip, storedProfile, tourCard } from "./helpers/firstRun";

vi.setConfig({ testTimeout: 30_000 });

const broken = vi.hoisted(() => ({ on: false }));
vi.mock("../src/screens/onboarding/HelloStep", async (importOriginal) => {
  const real = await importOriginal<{ HelloStep: (props: HelloStepProps) => unknown }>();
  return {
    ...real,
    // Stands in for a step whose chunk never arrived: the render throws, as a rejected lazy import does.
    HelloStep: (props: HelloStepProps) => {
      if (broken.on) throw new Error("the step could not be loaded");
      return real.HelloStep(props);
    },
  };
});

const flag = () => window.localStorage.getItem(ONBOARDED_KEY);
const meter = () => screen.getByRole("meter");
const nextButton = () => screen.getByRole("button", { name: /^Next/ });
const READY = "HK$800 left of HK$800, SIMULATED";

afterEach(() => {
  broken.on = false;
});

describe("a part of setup that fails", () => {
  let quiet: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => quiet.mockRestore());

  it("lets the visitor into the app with the ready-made budget, and does not count the first run as seen", async () => {
    broken.on = true;
    const { api } = await openFirstRun();
    expect(await screen.findByRole("meter")).toHaveAttribute("aria-valuetext", READY);
    expect((await api.snapshot()).packet?.budget_minor).toBe(80_000);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(flag()).toBeNull();
  });
});

describe("Skip when the ready-made budget cannot be sealed", () => {
  it("keeps the visitor in setup with the reason, and the next press finishes", async () => {
    const { api, user } = await openFirstRun({ api: new FirstSealFails() });
    await hello();
    await user.click(skip());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That didn't go through"));
    expect(await hello()).toBeInTheDocument();
    expect(skip()).toBeEnabled();
    expect(flag()).toBeNull();
    expect((await api.snapshot()).mandate).toBeNull();

    await user.click(skip());
    expect(await tourCard()).toBeInTheDocument();
    expect(flag()).toBe("1");
    expect(meter()).toHaveAttribute("aria-valuetext", READY);
  });

  it("does not seal over a budget another phone sealed while this one was setting up", async () => {
    const { api, user } = await openFirstRun();
    await hello();
    const { m0Request } = await import("../src/booth/compile");
    await api.seal(m0Request(new Date()));
    const seal = vi.spyOn(api, "seal");
    await user.click(skip());
    expect(await tourCard()).toBeInTheDocument();
    expect(seal).not.toHaveBeenCalled();
  });
});

describe("a booth that does not answer", () => {
  it("lets the visitor into the app, which says so; the first run is kept for next time, and Try again brings the budget", async () => {
    const { user } = await openFirstRun({ api: new FirstLoadFails() });
    await hello();
    await user.click(skip());
    expect(await screen.findByText("Can't reach Wally")).toBeInTheDocument();
    expect(flag()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("meter")).toHaveAttribute("aria-valuetext", READY);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(flag()).toBeNull();
  });

  it("Try again on the budget step comes back to the budget step, with what was told", async () => {
    const { user } = await openFirstRun({ api: new FirstLoadFails() });
    await hello();
    await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "Mei");
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "What's your style?" });
    await user.click(screen.getByRole("button", { name: "Cozy" }));
    await user.click(nextButton());
    expect(await screen.findByText("Can't reach Wally")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Your first budget" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Step 3 of 4");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("button", { name: "Cozy" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: "What should Wally call you?" })).toHaveValue("Mei");
  });
});

describe("Skip keeps what was entered on the step in front", () => {
  it("keeps a nickname typed on Hello", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "Mei");
    await user.click(skip());
    await tourCard();
    expect(storedProfile()).toMatchObject({ nickname: "Mei" });
  });

  it("keeps the choices made on Your taste", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.type(screen.getByRole("textbox", { name: "What should Wally call you?" }), "Mei");
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "What's your style?" });
    await user.click(screen.getByRole("button", { name: "Cozy" }));
    await user.click(skip());
    await tourCard();
    expect(storedProfile()).toMatchObject({ nickname: "Mei", styles: ["cozy"] });
  });

  it("saves nothing when nothing was told (the judge's two taps)", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(skip());
    await tourCard();
    expect(storedProfile()).toBeNull();
  });
});

describe("a date that is cleared", () => {
  it("keeps the form on screen and asks for a date, instead of failing the whole first run", async () => {
    const { user } = await openFirstRun();
    await hello();
    await user.click(nextButton());
    await screen.findByRole("heading", { level: 1, name: "What's your style?" });
    await user.click(nextButton());
    await user.click(await screen.findByRole("radio", { name: "Pick a date" }));
    const until = screen.getByLabelText(/^Until/) as HTMLInputElement;
    fireEvent.change(until, { target: { value: "" } });
    expect(screen.getByRole("heading", { level: 1, name: "Your first budget" })).toBeInTheDocument();
    expect(document.querySelector(".onb-ends")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Review budget" }));
    expect(screen.getByText("Pick a date.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Your first budget" })).toBeInTheDocument();
    expect(flag()).toBeNull();
  });
});
