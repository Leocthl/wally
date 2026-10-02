// The seal moment: on Check and seal the lock closes where the person pressed, the haptic fires with it, the card reads
// Signed and the button Sealed; only then (after --dur-ceremony) the sealed screen takes over. Reduced motion (duration 0)
// goes straight on. Back is disabled while it plays.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { HAPTIC_PATTERNS } from "../src/ui/haptics";
import { FirstSealFails } from "./helpers/shellClients";

vi.setConfig({ testTimeout: 30_000 });

function firstRun() {
  window.localStorage.clear();
  window.location.hash = "#/budget";
  const user = userEvent.setup();
  render(<App api={new FirstSealFails()} /> as ReactElement);
  return { user };
}

async function toReview(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole("button", { name: /^Start/ }));
  await user.click(screen.getByRole("button", { name: /^Next/ }));
  expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
}

describe("the seal moment", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--dur-ceremony");
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.navigator, "vibrate");
  });

  it("closes the lock in place with a haptic, shows Signed and Sealed, then hands over to the sealed screen", async () => {
    document.documentElement.style.setProperty("--dur-ceremony", "400ms");
    const vibrate = vi.fn(() => true);
    Object.defineProperty(window.navigator, "vibrate", { value: vibrate, configurable: true });
    const { user } = firstRun();
    await toReview(user);
    expect(document.querySelector('.seal-lock[data-locked="false"]')).not.toBeNull();
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    // The moment plays on this screen.
    const sealed = await screen.findByRole("button", { name: "Sealed" });
    expect(sealed).toHaveAttribute("aria-disabled", "true");
    expect(document.querySelector(".seal-review")).toHaveAttribute("data-sealed");
    expect(document.querySelector('.seal-lock[data-locked="true"]')).not.toBeNull();
    expect(document.querySelector(".seal-summary")).toHaveAttribute("data-signed");
    expect(screen.getByText("Signed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Check and seal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.success]);
    // Then the sealed screen, with the lock already settled (no second close).
    expect(await screen.findByRole("heading", { level: 1, name: "Your budget is sealed" }, { timeout: 3000 })).toBeInTheDocument();
    expect(document.querySelector(".seal-lock[data-settled]")).not.toBeNull();
  });

  it("goes straight to the sealed screen when the moment has no duration (reduced motion)", async () => {
    const { user } = firstRun();
    await toReview(user);
    await user.click(screen.getByRole("button", { name: /Seal budget/ }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Your budget is sealed" })).toBeInTheDocument());
  });
});
