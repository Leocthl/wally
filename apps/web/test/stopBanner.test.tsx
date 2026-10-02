// StopBanner renders from template ids and recorded inputs only (docs/04 StopBanner, 00-context Explanation template IDs).
import { render, screen, within } from "@testing-library/react";
import type { TemplateId } from "@laisee/core/ports";
import { describe, expect, it } from "vitest";
import { StopBanner } from "../src/components/StopBanner";
import { SIMULATED } from "../src/domain/provenance";
import { figureContext } from "../src/explain/figures";
import { TEMPLATES } from "../src/explain/templates";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

const ctx = figureContext({ api: "mock", money: SIMULATED, judge: SIMULATED });

const SAMPLE: Readonly<Record<TemplateId, { inputs: Record<string, unknown>; outcome: "DENY" | "ESCALATE"; start: RegExp }>> = {
  "R1.invalid_signature": { inputs: {}, outcome: "DENY", start: /^Stopped by R1\./ },
  "R2.revoked": { inputs: { revoked_at: "2026-10-03T02:08:00Z" }, outcome: "DENY", start: /^Stopped by R2\./ },
  "R2.expired": { inputs: { valid_until: "2026-10-31T15:59:59Z" }, outcome: "DENY", start: /^Stopped by R2\./ },
  "R3.over_remaining": { inputs: { total_minor: 55000, remaining_minor: 54100 }, outcome: "DENY", start: /^Stopped by R3\. Total HK\$550 .*HK\$541 .*left\./ },
  "R4.over_cap": { inputs: { total_minor: 55000, cap_minor: 40000 }, outcome: "DENY", start: /^Stopped by R4\./ },
  "R4.ask_above": { inputs: { total_minor: 35000, ask_above_minor: 30000 }, outcome: "ESCALATE", start: /^Escalated by R4\./ },
  "R5.over_ceiling": { inputs: { total_minor: 250000, ceiling_minor: 200000 }, outcome: "DENY", start: /^Stopped by R5\./ },
  "R6.off_mandate": { inputs: { what: "Category electronics" }, outcome: "DENY", start: /^Stopped by R6\. Category electronics/ },
  "R7.velocity": { inputs: { n: 4, max: 3, window_s: 600 }, outcome: "DENY", start: /^Stopped by R7\./ },
  "R8.max_active": { inputs: { active: 2, max: 2 }, outcome: "DENY", start: /^Stopped by R8\./ },
  "R9.flagged": { inputs: { captured_at: "2026-10-03T01:40:00Z" }, outcome: "DENY", start: /^Stopped by R9\. Seller flagged/ },
  "R9.unverified": { inputs: {}, outcome: "ESCALATE", start: /^Escalated by R9\. No record, not proof of safety\./ },
  "R10.injection": { inputs: { p: 0.6818, threshold: 0.63 }, outcome: "DENY", start: /^Stopped by R10\. Injection risk 0\.68\s*SIMULATED\s*over 0\.63/ },
  "R10.seller_risk": { inputs: { p: 0.6808, threshold: 0.55, verdict: "DENY" }, outcome: "DENY", start: /^Stopped by R10\. Seller risk/ },
  "R10.scope": { inputs: { category: "apparel" }, outcome: "ESCALATE", start: /^Escalated by R10\. May be outside apparel\./ },
  "R10.escalate": { inputs: { p: 0.55, threshold: 0.5 }, outcome: "ESCALATE", start: /^Escalated by R10\./ },
  "R10.unavailable": { inputs: { status: "ERROR" }, outcome: "ESCALATE", start: /^Escalated by R10\. The judge could not check/ },
  "R11.expired": { inputs: { window_s: 60 }, outcome: "DENY", start: /^Stopped by R11\. No answer in 60 s/ },
  "R12.price_drift": { inputs: { approved_minor: 25900, seen_minor: 26800 }, outcome: "DENY", start: /^Stopped by R12\./ },
};

describe("StopBanner from template ids", () => {
  it("has a sample for every template the stub renders", () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(Object.keys(TEMPLATES).sort());
  });

  it.each(Object.entries(SAMPLE))("%s renders an alert from the template and recorded inputs", (id, sample) => {
    const { container } = render(<StopBanner templateId={id as TemplateId} inputs={sample.inputs} outcome={sample.outcome} ctx={ctx} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-template", id);
    const en = alert.querySelector('[lang="en"]');
    expect(en?.textContent ?? "").toMatch(sample.start);
    expect(alert.querySelector('[lang="zh-HK"]')?.textContent ?? "").toMatch(/\S/);
    expect(bareFigures(container)).toEqual([]);
    expect(numsWithoutChip(container)).toEqual([]);
  });

  it("states STOPPED or ESCALATED with the rule id, in text as well as colour", () => {
    render(<StopBanner templateId="R3.over_remaining" inputs={SAMPLE["R3.over_remaining"].inputs} outcome="DENY" ctx={ctx} />);
    expect(screen.getByRole("alert")).toHaveTextContent("STOPPED R3");
    render(<StopBanner templateId="R9.unverified" inputs={{}} outcome="ESCALATE" ctx={ctx} />);
    expect(screen.getAllByRole("alert")[1]).toHaveTextContent("ESCALATED R9");
  });

  it("shows the SIMULATED chip once when every figure shares that provenance", () => {
    const { container } = render(<StopBanner templateId="R3.over_remaining" inputs={SAMPLE["R3.over_remaining"].inputs} outcome="DENY" ctx={ctx} />);
    const chips = within(container).getAllByText("SIMULATED");
    expect(chips.length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('[data-chip][data-prov="SIMULATED"]')).toHaveLength(1);
  });

  it("keeps a chip beside each figure when provenances differ (judge output vs ASSUMED threshold)", () => {
    const { container } = render(<StopBanner templateId="R10.injection" inputs={SAMPLE["R10.injection"].inputs} outcome="DENY" ctx={ctx} />);
    const en = container.querySelector('[lang="en"]') as HTMLElement;
    expect(en.querySelectorAll('[data-chip][data-prov="SIMULATED"]')).toHaveLength(1);
    expect(en.querySelectorAll('[data-chip][data-prov="ASSUMED"]')).toHaveLength(1);
  });

  it("uses a live judge chip (MEASURED, n=1) when the judge is not a replay", () => {
    const live = figureContext({ api: "http", money: SIMULATED, judge: { kind: "MEASURED", n: 1 } });
    const { container } = render(<StopBanner templateId="R10.injection" inputs={SAMPLE["R10.injection"].inputs} outcome="DENY" ctx={live} />);
    expect(container.querySelector('[data-prov="MEASURED"]')).not.toBeNull();
  });

  it("fails closed to a sentence without figures for an unknown template", () => {
    const { container } = render(<StopBanner templateId={"R99.nope" as TemplateId} inputs={{}} outcome="DENY" ctx={ctx} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(bareFigures(container)).toEqual([]);
  });

  it("renders text from an injected renderer, so lane A's explain module swaps in at one line", () => {
    const custom = () => "Stopped by R3. Custom sentence HK$12 over HK$5.";
    const { container } = render(<StopBanner templateId="R3.over_remaining" inputs={{ total_minor: 1200, remaining_minor: 500 }} outcome="DENY" ctx={ctx} render={custom} />);
    expect(container).toHaveTextContent("Custom sentence");
    expect(bareFigures(container)).toEqual([]);
  });
});
