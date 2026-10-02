// Display primitives and Wally: figures speak the amount, chips keep the docs/04 text and data attributes, steps say
// their status in words, Wally has a name in the current language and a mini drawing for small sizes.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ASSUMED, measured, observed, SIMULATED } from "../src/domain/provenance";
import { ProvenanceChip, Tag } from "../src/ui/Chip";
import { clampRatio, ProgressBar, Ring, Stat } from "../src/ui/Data";
import { EmptyState } from "../src/ui/EmptyState";
import { LocaleProvider } from "../src/ui/locale";
import { Steps } from "../src/ui/Steps";
import { Card, HeroPanel, List, ListRow, Skeleton, VisuallyHidden } from "../src/ui/Surface";
import { MINI_BELOW_PX, Wally, WALLY_STATES } from "../src/wally/Wally";
import { WallyArt } from "../src/wally/art";
import { Wordmark } from "../src/wally/Wordmark";

describe("figures", () => {
  it("clamps ratios and fails safe on bad input", () => {
    expect([clampRatio(5, 10), clampRatio(-1, 10), clampRatio(20, 10), clampRatio(1, 0), clampRatio(Number.NaN, 10)]).toEqual([0.5, 0, 1, 0, 0]);
  });

  it("ProgressBar as a meter speaks the amount, not a percentage", () => {
    render(<ProgressBar role="meter" value={54100} max={80000} label="Budget left" valueText="HK$541 of HK$800" />);
    const m = screen.getByRole("meter", { name: "Budget left" });
    expect(m).toHaveAttribute("aria-valuetext", "HK$541 of HK$800");
    expect(m).toHaveAttribute("aria-valuenow", "54100");
    expect(m.querySelector<HTMLElement>(".w-progress__fill")?.style.width).toBe("67.63%");
  });

  it("Ring keeps its centre content and hides the drawing", () => {
    render(<Ring value={14} max={14} label="Receipts" valueText="14 of 14 verified">done</Ring>);
    const r = screen.getByRole("meter", { name: "Receipts" });
    expect(r).toHaveTextContent("done");
    expect(r.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("Stat shows label, value, sub and a chip slot", () => {
    render(<Stat label="Budget left" value="HK$541" sub="of your HK$800 budget" chip={<ProvenanceChip prov={SIMULATED} />} delta={{ text: "-HK$259", tone: "neutral" }} />);
    expect(screen.getByText("HK$541")).toHaveClass("w-stat__value");
    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
    expect(screen.getByText("-HK$259")).toHaveClass("w-stat__delta--neutral");
  });
});

describe("chips and tags", () => {
  it("ProvenanceChip keeps the exact docs/04 text and the data attributes the figure tests read", () => {
    const { container } = render(<><ProvenanceChip prov={SIMULATED} /><ProvenanceChip prov={measured(150)} /><ProvenanceChip prov={ASSUMED} /><ProvenanceChip prov={observed("2026-10-03T02:05:00Z", "capture sheet")} /></>);
    const chips = [...container.querySelectorAll("[data-chip]")];
    expect(chips.map((c) => c.getAttribute("data-prov"))).toEqual(["SIMULATED", "MEASURED", "ASSUMED", "OBSERVED"]);
    expect(chips.map((c) => c.textContent)).toEqual(["SIMULATED", "MEASURED(n=150)", "ASSUMED", "OBSERVED(2026-10-03 10:05 UTC+8, capture sheet)"]);
    expect(chips[0]).toHaveClass("chip", "chip--sim");
    for (const svg of container.querySelectorAll("svg")) expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("Tag renders words with an optional hidden icon", () => {
    render(<Tag tone="stop" icon={<svg aria-hidden="true" />}>Stopped before paying</Tag>);
    expect(screen.getByText("Stopped before paying")).toHaveClass("w-tag", "w-tag--stop");
  });
});

describe("surfaces", () => {
  it("Card, HeroPanel and List render their landmarks and rows as links or buttons", () => {
    render(
      <>
        <HeroPanel label="Budget left">x</HeroPanel>
        <Card tone="ticket" as="article" aria-label="One-off card">card</Card>
        <List label="Recent" cards>
          <ListRow title="Denim jacket" href="#/r/1" chevron />
          <ListRow title="Running shoes" onClick={() => undefined} />
          <ListRow title="Rules sealed" />
        </List>
        <Skeleton lines={3} />
        <VisuallyHidden>hidden words</VisuallyHidden>
      </>,
    );
    expect(screen.getByRole("region", { name: "Budget left" })).toHaveClass("w-hero");
    expect(screen.getByRole("article", { name: "One-off card" })).toHaveClass("w-card--ticket");
    expect(screen.getByRole("list", { name: "Recent" })).toHaveClass("w-list--cards");
    expect(screen.getByRole("link", { name: "Denim jacket" })).toHaveAttribute("href", "#/r/1");
    expect(screen.getByRole("button", { name: "Running shoes" })).toBeInTheDocument();
    expect(document.querySelectorAll(".w-skeleton")).toHaveLength(3);
    expect(document.querySelector(".w-skeleton-group")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("hidden words")).toHaveClass("sr-only");
  });

  it("Steps is an ordered list that says each status in words, current step marked", () => {
    render(<Steps label="What Wally did" items={[{ id: "a", title: "Picked an item", status: "done" }, { id: "b", title: "Checked your rules", status: "now" }, { id: "c", title: "Made a one-off card", status: "waiting" }]} />);
    const list = screen.getByRole("list", { name: "What Wally did" });
    expect(list.tagName).toBe("OL");
    const items = screen.getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(["Picked an item, Done", "Checked your rules, In progress", "Made a one-off card, Waiting"]);
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });
});

describe("Wally", () => {
  it.each(WALLY_STATES)("%s has an English name, a hidden drawing and a data-state", (state) => {
    render(<Wally state={state} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("data-state", state);
    expect(img.getAttribute("aria-label")).toMatch(/Wally/);
    expect(img.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("names itself in zh-HK under the zh-HK locale and can be decorative", () => {
    render(<LocaleProvider locale="zh-HK"><Wally state="stopped" /><Wally state="idle" decorative /></LocaleProvider>);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("aria-label", "Wally 在付款前攔截了");
    expect(img).toHaveAttribute("lang", "zh-HK");
    expect(document.querySelectorAll('[aria-hidden="true"].wally')).toHaveLength(1);
  });

  it("switches to the mini drawing below 40 px (no pupil highlights, no ground shadow)", () => {
    const { container, rerender } = render(<Wally size={MINI_BELOW_PX - 16} />);
    expect(container.querySelector(".wally")).toHaveClass("wally--mini");
    expect(container.querySelector(".wally__ground")).toBeNull();
    rerender(<Wally size={160} />);
    expect(container.querySelector(".wally")).toHaveClass("wally--full");
    expect(container.querySelector(".wally__ground")).not.toBeNull();
  });

  it("shows the state in the drawing itself: sparkles, shield, sleep", () => {
    const { container, rerender } = render(<WallyArt state="approved" />);
    expect(container.querySelectorAll(".wally__spark")).toHaveLength(2);
    rerender(<WallyArt state="stopped" />);
    expect(container.querySelector(".wally__shield")).not.toBeNull();
    rerender(<WallyArt state="offline" />);
    expect(container.querySelectorAll(".wally__z")).toHaveLength(2);
    rerender(<WallyArt state="idle" variant="inverse" fills={{ body: "#fff", flap: "#ddd", card: "#0c9", stripe: "#096", face: "#fff", pupil: "#123", shadow: "#0002", spark: "#0c9", stop: "#d22", onStop: "#fff", muted: "#567" }} />);
    expect(container.innerHTML).not.toContain("var(--");
  });

  it("EmptyState shows Wally (decorative), a title, a body and an action", () => {
    render(<EmptyState wally="offline" title="You're offline" body="Wally still works on this phone." action={<button type="button">Reload</button>} />);
    expect(screen.getByText("You're offline")).toHaveClass("w-empty__title");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("Wordmark reads as one word to assistive tech", () => {
    render(<Wordmark />);
    expect(screen.getByRole("img", { name: "Wally" })).toHaveClass("wordmark");
  });
});
