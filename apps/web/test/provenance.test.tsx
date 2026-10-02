import { render, screen } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ChipScope } from "../src/components/ChipScope";
import { Num } from "../src/components/Num";
import { ProvChip } from "../src/components/ProvChip";
import { formatHkd, parseHkd } from "../src/domain/money";
import { ASSUMED, chipText, measured, observed, SIMULATED } from "../src/domain/provenance";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

describe("ProvChip text (docs/04)", () => {
  it("renders each kind exactly", () => {
    expect(chipText(SIMULATED)).toBe("SIMULATED");
    expect(chipText(measured(1))).toBe("MEASURED(n=1)");
    expect(chipText(ASSUMED)).toBe("ASSUMED");
    expect(chipText({ kind: "ASSUMED", suffix: "READ-BY-CLAUDE" })).toBe("ASSUMED (READ-BY-CLAUDE)");
    expect(chipText(observed("2026-10-03T02:05:00Z", "capture-sheet row 3"))).toBe("OBSERVED(2026-10-03 10:05 UTC+8, capture-sheet row 3)");
  });

  it("refuses a MEASURED chip without a sample count", () => {
    expect(() => measured(0)).toThrow();
  });

  it("marks the kind for styling and shows text beside the glyph", () => {
    const { container } = render(<ProvChip prov={SIMULATED} />);
    const chip = container.querySelector("[data-chip]");
    expect(chip).toHaveAttribute("data-prov", "SIMULATED");
    expect(chip).toHaveTextContent("SIMULATED");
  });
});

describe("Num", () => {
  it("always renders its value with a chip", () => {
    const { container } = render(<Num kind="money" value={25900} prov={SIMULATED} />);
    expect(container).toHaveTextContent("HK$259");
    expect(container).toHaveTextContent("SIMULATED");
    expect(numsWithoutChip(container)).toEqual([]);
    expect(bareFigures(container)).toEqual([]);
  });

  it("fails closed to UNKNOWN with no figure when provenance is missing", () => {
    const { container } = render(<Num kind="money" value={25900} prov={undefined} />);
    expect(container).toHaveTextContent("UNKNOWN");
    expect(container).not.toHaveTextContent(/\d/);
  });

  it("lets a scope carry the chip once for figures of the same provenance", () => {
    const { container } = render(
      <ChipScope provs={[SIMULATED]}>
        <Num kind="money" value={25900} prov={SIMULATED} chip="scope" />
        <Num kind="money" value={54100} prov={SIMULATED} chip="scope" />
      </ChipScope>,
    );
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(1);
    expect(numsWithoutChip(container)).toEqual([]);
  });

  it("falls back to an inline chip when the scope shows a different provenance", () => {
    const { container } = render(
      <ChipScope provs={[SIMULATED]}>
        <Num kind="prob" value={0.63} prov={ASSUMED} chip="scope" />
      </ChipScope>,
    );
    expect(container.querySelectorAll("[data-chip]")).toHaveLength(2);
    expect(numsWithoutChip(container)).toEqual([]);
  });

  it("formats each kind without float noise", () => {
    render(
      <>
        <Num kind="prob" value={0.6818} prov={SIMULATED} />
        <Num kind="ms" value={291.4} prov={SIMULATED} />
        <Num kind="seconds" value={60} prov={ASSUMED} />
        <Num kind="count" value={3} prov={ASSUMED} />
        <Num kind="time" value="2026-10-03T02:05:00Z" prov={SIMULATED} />
      </>,
    );
    expect(screen.getByText("0.68")).toBeInTheDocument();
    expect(screen.getByText("291 ms")).toBeInTheDocument();
    expect(screen.getByText("60 s")).toBeInTheDocument();
    expect(screen.getByText("10:05:00")).toBeInTheDocument();
  });

  it("property: any integer amount renders a chip and round-trips through the formatter", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_00 }), (minor) => {
        const { container, unmount } = render(<Num kind="money" value={minor} prov={SIMULATED} />);
        const ok = numsWithoutChip(container).length === 0 && bareFigures(container).length === 0 && parseHkd(formatHkd(minor)) === minor;
        unmount();
        return ok;
      }),
      { numRuns: 60 },
    );
  });
});

describe("money", () => {
  it("formats the storyline amounts (F20-F23)", () => {
    expect(formatHkd(80000)).toBe("HK$800");
    expect(formatHkd(54100)).toBe("HK$541");
    expect(formatHkd(55000)).toBe("HK$550");
    expect(formatHkd(123450)).toBe("HK$1,234.50");
  });

  it("rejects non-integer minor units", () => {
    expect(() => formatHkd(10.5)).toThrow(RangeError);
  });
});
