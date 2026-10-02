// Lane B polish: the quiet Stopped card and its path, the one-off card in each state, the ask echo, the evidence reveal and
// the up-front misses, and the proof strip's stagger. Behaviour only; the look is checked in the browser.
import { act, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardRecord, ScenarioId } from "../src/api/types";
import { Misses, missesOf } from "../src/evidence/components/Misses";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import type { HarnessRun } from "../src/evidence/types";
import { useReveal } from "../src/evidence/useReveal";
import { OneOffCard } from "../src/screens/console/OneOffCard";
import { claimAsk, noteAsk } from "../src/screens/run/askEcho";
import { Stopped } from "../src/screens/run/components/Stopped";
import { selectScreen } from "../src/screens/run/model/screen";
import { ChainStrip } from "../src/screens/proof/components/ChainStrip";
import { LocaleProvider } from "../src/ui/locale";
import { CLEAN, honestyProblems } from "./evidenceFigures";
import { harnessFile, rate } from "./evidenceFixtures";
import { play } from "./runTraces";

const noop = (): void => undefined;

function card(over: Partial<CardRecord> = {}): CardRecord {
  return {
    id: "crd_1", decision_id: "dec_1", mandate_id: "mnd_1", handle: "h", last4: "4821", limit_minor: 25900, currency: "HKD",
    minted_at: "2026-10-03T02:00:00Z", expires_at: "2099-10-03T02:30:00Z", state: "ACTIVE", merchant_lock: "demo-shop.example", simulated: true, ...over,
  };
}

describe("OneOffCard", () => {
  it("a ready card shows the exact amount, SIMULATED, the shop lock, a live clock and a life line", () => {
    const { container } = render(<OneOffCard card={card()} shop="Demo Apparel" />);
    const el = screen.getByRole("article", { name: "One-off card" });
    expect(el).toHaveTextContent("HK$259");
    expect(el).toHaveTextContent("Works once, for this amount only");
    expect(el).toHaveTextContent("Card ending 4821");
    expect(el).toHaveTextContent("Only at Demo Apparel");
    expect(el).toHaveTextContent(/Ends in \d+:\d\d/);
    expect(within(el).getByRole("timer")).toBeInTheDocument();
    expect(el.querySelector('[data-prov="SIMULATED"]')).not.toBeNull();
    expect(container.querySelector(".oc__life")).not.toBeNull();
    expect(container.querySelector(".oc__stamp")).toBeNull();
  });

  it.each([["USED", "Paid"], ["VOIDED", "Cancelled"], ["EXPIRED", "Expired"]] as const)("a %s card drops the clock and takes a %s stamp", (state, word) => {
    const { container } = render(<OneOffCard card={card({ state })} shop="Demo Apparel" />);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(container.querySelector(".oc__life")).toBeNull();
    expect(container.querySelector(".oc__stamp")).toHaveTextContent(word);
  });

  it("the stamp lands only when the state changes while the card is on screen", () => {
    const view = render(<OneOffCard card={card({ state: "USED" })} shop="Demo Apparel" />);
    expect(view.container.querySelector(".oc__stamp--land")).toBeNull();
    const fresh = render(<OneOffCard card={card()} shop="Demo Apparel" />);
    fresh.rerender(<OneOffCard card={card({ state: "USED" })} shop="Demo Apparel" />);
    expect(fresh.container.querySelector(".oc__stamp--land")).not.toBeNull();
  });

  it("a card that is not there yet is a quiet skeleton, not a blank", () => {
    render(<OneOffCard card={undefined} shop="" />);
    expect(screen.getByRole("article", { name: "One-off card" })).toHaveAttribute("aria-busy", "true");
  });

  it("shakes the card when a decline arrives while mounted (WAAPI), not on first paint", () => {
    const animate = vi.fn();
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate as unknown as typeof HTMLElement.prototype.animate;
    try {
      const view = render(<OneOffCard card={card()} shop="Demo Apparel" declines={1} />);
      expect(animate).not.toHaveBeenCalled();
      view.rerender(<OneOffCard card={card()} shop="Demo Apparel" declines={2} />);
      expect(animate).toHaveBeenCalledTimes(1);
    } finally {
      HTMLElement.prototype.animate = original;
    }
  });
});

describe("Stopped before paying", () => {
  type Res = Extract<ReturnType<typeof selectScreen>, { kind: "result" }>["result"];
  function pick(model: ReturnType<typeof selectScreen>): Res | null {
    return model.kind === "result" ? model.result : null;
  }
  async function stoppedResult(...ids: ScenarioId[]): Promise<Res> {
    const rec = await play(...ids);
    const result = pick(selectScreen(rec.state()));
    if (!result) throw new Error("no result");
    return result;
  }
  const view = (result: Res, packet = null as null | { remaining_minor: number }) =>
    render(
      <LocaleProvider locale="en">
        <Stopped result={result} fresh={false} headingRef={null} onWhy={noop} onTopUp={noop} onAsk={noop} {...(packet ? { packet: packet as never } : {})} />
      </LocaleProvider>,
    );

  it("shows the four-step path with the stop at the rules check, and the safe strip", async () => {
    const result = await stoppedResult("overflow");
    const { container } = view(result, { remaining_minor: 80000 });
    const path = container.querySelector(".run-path")!;
    expect([...path.querySelectorAll("li")].map((li) => li.getAttribute("data-status"))).toEqual(["done", "done", "stop", "none"]);
    expect(path.textContent).toMatch(/Rules, stopped here/);
    expect(screen.getByRole("alert")).toHaveTextContent("Stopped before paying");
    expect(container.querySelector(".run-safe")).toHaveTextContent("No card was made. Nothing can be charged.");
    expect(container.querySelector(".run-safe")).toHaveTextContent("HK$800 is still in your budget.");
    expect(container.querySelector(".run-safe [data-prov='SIMULATED']")).not.toBeNull();
  });

  it("leaves the path out when a question ended (you said no), because the rules check did not stop it", async () => {
    const rec = await play("unverified");
    const id = (await rec.api.snapshot()).escalations.at(-1)!.decisionId;
    await rec.api.answerEscalation({ decisionId: id, choice: "DENY" });
    const model = selectScreen(rec.state(), { id });
    const result = pick(model);
    if (!result) throw new Error("no result");
    const { container } = view(result);
    expect(result.answer).toBe("no");
    expect(container.querySelector(".run-path")).toBeNull();
  });
});

describe("the ask echo", () => {
  it("the first run after an ask claims its words once; a later run gets nothing", () => {
    noteAsk("  A plain white tee under HK$150  ", 1_000);
    expect(claimAsk("run_a", 2_000)).toBe("A plain white tee under HK$150");
    expect(claimAsk("run_a", 3_000)).toBe("A plain white tee under HK$150");
    expect(claimAsk("run_b", 4_000)).toBeUndefined();
  });

  it("words older than the window are never shown", () => {
    noteAsk("old question", 1_000);
    expect(claimAsk("run_c", 1_000 + 21_000)).toBeUndefined();
  });
});

describe("evidence reveal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sets no attribute where IntersectionObserver is missing, so the bars simply stand there", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { result } = renderHook(() => useReveal<HTMLDivElement>());
    expect(result.current.reveal).toBeUndefined();
  });

  it("starts pending and flips to in once, when the card first shows", () => {
    let fire: (entries: { isIntersecting: boolean }[]) => void = noop;
    class FakeObserver {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        fire = cb;
      }
      observe = noop;
      disconnect = noop;
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    function Probe(): React.ReactElement {
      const { ref, reveal } = useReveal<HTMLDivElement>();
      return <div ref={ref} data-testid="probe" data-reveal={reveal} />;
    }
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveAttribute("data-reveal", "pending");
    act(() => fire([{ isIntersecting: true }]));
    expect(screen.getByTestId("probe")).toHaveAttribute("data-reveal", "in");
  });
});

describe("where the full pipeline is not better", () => {
  function run(raw: Record<string, unknown>): HarnessRun {
    const parsed = parseHarnessFile("harness-1-live.json", raw);
    if (!parsed.ok) throw new Error(parsed.problems.join("; "));
    return parsed.value;
  }
  const base = harnessFile() as { baselines: Record<string, Record<string, unknown>> };

  it("lists a rate where B2 is higher than a baseline, with both figures chipped and the overlap said", () => {
    const worse = run(harnessFile({ baselines: { ...base.baselines, B2: { ...base.baselines["B2"], false_block_rate: rate(5, 10) } } }));
    expect(missesOf(worse).map((m) => `${m.key}:${m.against}`)).toEqual(expect.arrayContaining(["false_block_rate:B1"]));
    const { container } = render(<LocaleProvider locale="en"><Misses run={worse} /></LocaleProvider>);
    const row = container.querySelector('[data-miss="false_block_rate:B1"]')!;
    expect(row).toHaveTextContent("5/10");
    expect(row).toHaveTextContent("1/10");
    expect(honestyProblems(container)).toEqual(CLEAN);
  });

  it("renders nothing when the full pipeline is no worse anywhere", () => {
    const { container } = render(<LocaleProvider locale="en"><Misses run={run(harnessFile())} /></LocaleProvider>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the proof strip", () => {
  it("staggers the links so the whole wipe takes about the same time for any log", () => {
    const stagger = (total: number): string => render(<ChainStrip total={total} result={{ ok: true }} runKey={String(total)} />).container.querySelector<HTMLElement>(".pf-chain")!.style.getPropertyValue("--pf-stagger");
    expect(stagger(5)).toBe("60ms");
    expect(Number.parseInt(stagger(24), 10)).toBeLessThanOrEqual(25);
  });
});
