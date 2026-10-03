// When the first run opens: only on the landing screen, and only with no flag.
import { describe, expect, it } from "vitest";
import { firstRunPending, opensOnLanding } from "../src/screens/onboarding/OnboardingProvider";
import { createProfileStore, type ProfileStorage } from "../src/state/profile";
import { nextSelection } from "../src/screens/onboarding/controls";

const storage = (data: Record<string, string> = {}): ProfileStorage => ({
  getItem: (key) => data[key] ?? null,
  setItem: (key, value) => void (data[key] = value),
  removeItem: (key) => void delete data[key],
});

describe("opensOnLanding", () => {
  it.each(["", "#", "#/", "#/budget", "#/booth", "#/Budget", "#/nowhere", "#main"])("%j is the landing screen", (hash) => {
    expect(opensOnLanding(hash)).toBe(true);
  });

  it.each(["#/wally", "#/receipts", "#/proof", "#/seal", "#/seal?mode=welcome", "#/evidence", "#/presenter", "#/styleguide", "#/budget?focus=console", "#/console", "#/wally?d=dec_1"])("%j is a screen asked for by name, left alone", (hash) => {
    expect(opensOnLanding(hash)).toBe(false);
  });
});

describe("firstRunPending", () => {
  it("is true only on the landing screen with no flag", () => {
    expect(firstRunPending(createProfileStore(() => storage()), "#/budget")).toBe(true);
    expect(firstRunPending(createProfileStore(() => storage()), "#/proof")).toBe(false);
    expect(firstRunPending(createProfileStore(() => storage({ "wally:onboarded": "1" })), "#/budget")).toBe(false);
  });

  it("is false for a ?booth=1 link, in the address or in the hash: that is the crew setting up the stage", () => {
    const fresh = createProfileStore(() => storage());
    expect(firstRunPending(fresh, "#/budget", "?booth=1")).toBe(false);
    expect(firstRunPending(fresh, "#/budget?booth=1", "")).toBe(false);
    expect(firstRunPending(fresh, "#/budget", "?booth=0")).toBe(true);
  });
});

describe("nextSelection", () => {
  const options = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }] as const;

  it("flips the pressed option and keeps the options' own order", () => {
    expect(nextSelection(options, ["c"], "a")).toEqual(["a", "c"]);
    expect(nextSelection(options, ["a", "c"], "a")).toEqual(["c"]);
    expect(nextSelection(options, [], "b")).toEqual(["b"]);
  });

  it("drops anything it does not offer", () => {
    expect(nextSelection(options, ["z", "b"], "a")).toEqual(["a", "b"]);
  });
});
