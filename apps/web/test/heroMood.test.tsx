// What the Budget hero says: Wally's mood line and face follow the packet, the figures roll from what was last shown, and
// the welcome entrance plays once per page load.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Mandate, PacketState } from "../src/api/types";
import { BudgetHero } from "../src/screens/home/BudgetHero";
import { heroMood, MOOD_POSE, shares } from "../src/screens/home/heroModel";
import { forgetWelcome } from "../src/screens/home/useHeroMotion";
import { forgetLastShown, useFromLast } from "../src/screens/home/useFromLast";
import { LocaleProvider } from "../src/ui/locale";

const packet: PacketState = {
  mandate_id: "mnd_mei00001",
  log_id: "log_mei00001",
  budget_minor: 80_000,
  committed_minor: 0,
  spent_minor: 0,
  remaining_minor: 80_000,
  currency: "HKD",
  active_cards: [],
  mint_times: [],
  open_escalations: [],
  status: "ACTIVE",
  expires_at: "2026-10-31T15:59:59Z",
  folded_through_seq: 0,
  computed_at: "2026-10-03T02:00:00Z",
};
const mandate: Mandate = {
  id: "mnd_mei00001",
  delegator: "did:key:z6MkMeiKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  agent: "did:key:z6MkAgentKeyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  intent_text: "HK$800, clothes, verified sellers.",
  rules: { budget: { amount_minor: 80_000, currency: "HKD" }, categories: ["apparel"], merchants: { allow: null, deny: [] }, seller_check: { require_capture: true } },
  valid_from: "2026-10-03T02:00:00Z",
  valid_until: "2026-10-31T15:59:59Z",
};

describe("heroMood", () => {
  it("reads the packet in one word", () => {
    expect(heroMood(packet)).toBe("fresh");
    expect(heroMood({ ...packet, spent_minor: 25_900, remaining_minor: 54_100 })).toBe("going");
    expect(heroMood({ ...packet, committed_minor: 25_900, remaining_minor: 54_100 })).toBe("going");
    expect(heroMood({ ...packet, open_escalations: [{ decision_id: "dec_1", expires_at: "2026-10-03T02:01:00Z" }] })).toBe("waiting");
    expect(heroMood({ ...packet, status: "EXHAUSTED", remaining_minor: 0 })).toBe("usedUp");
    expect(heroMood({ ...packet, status: "REVOKED" })).toBe("cancelled");
    expect(heroMood({ ...packet, status: "EXPIRED" })).toBe("ended");
  });

  it("puts a closed budget before a waiting question", () => {
    expect(heroMood({ ...packet, status: "REVOKED", open_escalations: [{ decision_id: "dec_1", expires_at: "2026-10-03T02:01:00Z" }] })).toBe("cancelled");
  });

  it("gives Wally a pose per mood", () => {
    expect(MOOD_POSE).toEqual({ fresh: "idle", going: "idle", waiting: "thinking", usedUp: "approved", cancelled: "stopped", ended: "offline" });
  });
});

describe("shares", () => {
  it("splits the budget into left, held and spent, clamped to 0 and 1", () => {
    expect(shares({ ...packet, remaining_minor: 40_000, committed_minor: 20_000, spent_minor: 20_000 })).toEqual({ left: 0.5, held: 0.25, spent: 0.25 });
    expect(shares({ ...packet, budget_minor: 0 })).toEqual({ left: 0, held: 0, spent: 0 });
    expect(shares({ ...packet, remaining_minor: -5, spent_minor: 900_000 })).toMatchObject({ left: 0, spent: 1 });
  });
});

function hero(p: PacketState, locale?: "en" | "zh-HK") {
  window.localStorage.clear();
  return render(
    <LocaleProvider {...(locale ? { locale } : {})}>
      <div data-chip-scope>
        <BudgetHero packet={p} mandate={mandate} />
      </div>
    </LocaleProvider>,
  );
}

describe("BudgetHero mood", () => {
  beforeEach(() => {
    forgetWelcome();
    forgetLastShown();
  });

  it("greets a fresh budget by name, then speaks only the mood", () => {
    const { unmount } = hero(packet);
    expect(screen.getByText("Hi, I'm Wally.")).toBeInTheDocument();
    expect(screen.getByText("Ready when you are.")).toBeInTheDocument();
    expect(document.querySelector(".wally")).toHaveAttribute("data-state", "idle");
    unmount();
    hero({ ...packet, spent_minor: 25_900, remaining_minor: 54_100 });
    expect(screen.queryByText("Hi, I'm Wally.")).toBeNull();
    expect(screen.getByText("Shopping inside your rules.")).toBeInTheDocument();
  });

  it("asks for the OK in a thinking pose when an answer is waiting", () => {
    hero({ ...packet, open_escalations: [{ decision_id: "dec_1", expires_at: "2026-10-03T02:01:00Z" }] });
    expect(screen.getByText("I need your OK on a buy.")).toBeInTheDocument();
    expect(document.querySelector(".wally")).toHaveAttribute("data-state", "thinking");
    expect(document.querySelector(".home-hero")).toHaveAttribute("data-mood", "waiting");
  });

  it("says a cancelled and an ended budget are over, and Wally stops or sleeps", () => {
    const { unmount } = hero({ ...packet, status: "REVOKED" });
    expect(screen.getByText("I've stopped shopping with this one.")).toBeInTheDocument();
    expect(document.querySelector(".wally")).toHaveAttribute("data-state", "stopped");
    unmount();
    hero({ ...packet, status: "EXPIRED" });
    expect(screen.getByText("Time's up on this budget.")).toBeInTheDocument();
    expect(document.querySelector(".wally")).toHaveAttribute("data-state", "offline");
  });

  it("speaks 繁 when the screen does, and keeps the heading, the meter and one SIMULATED chip", () => {
    hero(packet, "zh-HK");
    expect(screen.getByText("你好，我係 Wally。")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "你的預算" })).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "剩餘 HK$800，總額 HK$800，SIMULATED");
    expect(document.querySelectorAll('.home-hero__card > .fig-chip [data-prov="SIMULATED"]')).toHaveLength(1);
  });

  it("plays the welcome once per page load, not on every return to Budget", () => {
    const first = hero(packet);
    expect(document.querySelector(".home-hero")).toHaveAttribute("data-welcome");
    first.unmount();
    hero(packet);
    expect(document.querySelector(".home-hero")).not.toHaveAttribute("data-welcome");
  });
});

describe("useFromLast", () => {
  beforeEach(() => forgetLastShown());

  function Probe({ value, seen }: { readonly value: number; readonly seen: number[] }): null {
    seen.push(useFromLast("k", value));
    return null;
  }

  it("shows the value as it is the first time, and travels from the last value shown afterwards", () => {
    const first: number[] = [];
    render(<Probe value={80_000} seen={first} />).unmount();
    expect(first).toEqual([80_000]);
    const second: number[] = [];
    render(<Probe value={54_100} seen={second} />);
    // the first frame still shows what the screen showed last (80,000); the effect then moves it to the new value
    expect(second[0]).toBe(80_000);
    expect(second.at(-1)).toBe(54_100);
  });
});
