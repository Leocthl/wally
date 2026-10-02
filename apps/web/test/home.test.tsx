// Budget home (lane b-shell): the budget card on live data, rule tags, Recent with receipt numbers that open Wally, Try
// asking, and the selectors over the state the reducer keeps for the budget in force.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Decision, LogEntry } from "../src/api/types";
import { cardGroups, currentEntries, openEscalations, recentDecisions } from "../src/screens/home/selectors";
import { initialState, type BoothState } from "../src/state/booth";
import { bootApp, go, press } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

vi.setConfig({ testTimeout: 30_000 });

describe("budget card", () => {
  it("shows what is left, of the total and until when, a meter, spent and held, and the rules as tags", async () => {
    await bootApp("#/budget");
    const hero = screen.getByRole("region", { name: "Your budget" });
    expect(within(hero).getByText("Budget left")).toBeInTheDocument();
    expect(hero).toHaveTextContent(/HK\$800\s*of your HK\$800 budget · until \d{1,2} \w{3}/);
    expect(screen.getByRole("meter", { name: "Budget left" })).toHaveAttribute("aria-valuetext", "HK$800 left of HK$800, SIMULATED");
    expect(hero).toHaveTextContent("SpentHK$0");
    expect(hero).toHaveTextContent("On one-off cardsHK$0");
    const tags = within(hero).getByRole("list", { name: "Rules Wally must follow" });
    expect(within(tags).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Clothes only", "Verified sellers", "Signed rules"]);
    expect(hero.querySelector(':scope > .fig-chip [data-prov="SIMULATED"]')).not.toBeNull();
    expect(bareFigures(hero)).toEqual([]);
    expect(numsWithoutChip(hero)).toEqual([]);
  });

  it("drops by the exact amount after a purchase and lists it first in Recent", async () => {
    const h = await bootApp("#/budget");
    expect(screen.getByText(/Nothing yet\. Try asking Wally below\./)).toBeInTheDocument();
    await press(h, "normal");
    expect(window.location.hash).toBe("#/wally");
    await go("#/budget");
    await waitFor(() => expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "HK$541 left of HK$800, SIMULATED"));
    const recent = screen.getByRole("list", { name: "Recent" });
    const first = within(recent).getAllByRole("link")[0]!;
    expect(first).toHaveTextContent(/Approved · #\d+/);
    expect(first).toHaveTextContent("HK$259");
    const decisionId = (await h.api.snapshot()).log.entries.filter((e) => e.kind === "DECISION").at(-1)?.payload["id"];
    expect(first).toHaveAttribute("href", `#/wally?d=${String(decisionId)}`);
  });

  it("keeps Recent to the last three purchases, newest first, each with its state in words", async () => {
    const h = await bootApp("#/budget");
    for (const id of ["normal", "flagged", "injected", "off_category"]) await press(h, id);
    await go("#/budget");
    const rows = within(screen.getByRole("list", { name: "Recent" })).getAllByRole("link");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector("[data-outcome]")?.getAttribute("data-outcome"))).toEqual(["DENY", "DENY", "DENY"]);
    expect(rows[0]).toHaveTextContent("Stopped before paying");
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "#/receipts");
  });

  it("reads in 繁 with the same figures", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    const hero = screen.getByRole("region", { name: "你的預算" });
    expect(hero).toHaveTextContent("預算剩餘");
    expect(hero).toHaveTextContent("只限衣物");
    expect(hero).toHaveTextContent(/總預算 HK\$800 · 有效至/);
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "剩餘 HK$800，總額 HK$800，SIMULATED");
    expect(screen.getByRole("heading", { name: "試吓問" })).toBeInTheDocument();
  });
});

describe("Try asking", () => {
  it("shows every booth scenario in four plain-language groups", async () => {
    await bootApp("#/budget");
    const groups = screen.getAllByRole("group").filter((g) => g.querySelector("[data-scenario]"));
    expect(groups.map((g) => g.querySelector("h3")?.textContent)).toEqual(["Buy", "Stops", "Card", "Budget"]);
    expect(screen.getByRole("button", { name: /Earbuds on a clothes budget/ })).toHaveAttribute("data-scenario", "off_category");
    expect(document.querySelectorAll("main [data-scenario]")).toHaveLength(13);
  });

  it("runs a card and shows Wally at work", async () => {
    const h = await bootApp("#/budget");
    await press(h, "flagged");
    expect(window.location.hash).toBe("#/wally");
    await waitFor(async () => expect((await h.api.snapshot()).log.entries.some((e) => e.kind === "DECISION")).toBe(true));
  });
});

// ---- selectors ----

const entry = (seq: number, logId: string, kind: LogEntry["kind"], payload: Record<string, unknown>): LogEntry =>
  ({ v: 1, log_id: logId, seq, kind, ts: "2026-10-03T02:00:00Z", prev_hash: "0", payload, payload_hash: "0", entry_hash: `h${seq}`, signer: "did:key:z", signature: "s" }) as LogEntry;

const decision = (id: string, outcome: Decision["outcome"], title: string, total: number, resolves?: string): Record<string, unknown> => ({
  id, outcome, decided_at: "2026-10-03T02:00:00Z", ...(resolves ? { resolves } : {}),
  cart: { items: [{ title, category: "apparel", qty: 1, unit_price_minor: total }], merchant: { name: "Demo", domain: "demo.example" }, total_minor: total },
});

function stateWith(entries: readonly LogEntry[], logId: string): BoothState {
  const s = initialState();
  return { ...s, log: { ...s.log, entries, shown: entries }, packet: { log_id: logId } as BoothState["packet"] };
}

describe("selectors", () => {
  it("read the records the reducer holds for the budget in force", () => {
    const fresh = entry(1, "log_new", "DECISION", decision("dec_new", "DENY", "Hoodie", 200));
    const state = stateWith([fresh], "log_new");
    expect(currentEntries(state)).toEqual([fresh]);
    expect(recentDecisions(state).map((r) => r.id)).toEqual(["dec_new"]);
  });

  it("show a purchase once, as its final state, when a later decision closes it", () => {
    const asked = entry(1, "log", "DECISION", decision("dec_1", "ESCALATE", "Tee", 25900));
    const expired = entry(2, "log", "DECISION", decision("dec_2", "DENY", "Tee", 25900, "dec_1"));
    const rows = recentDecisions(stateWith([asked, expired], "log"));
    expect(rows).toEqual([{ id: "dec_2", seq: 2, outcome: "DENY", title: "Tee", merchant: "Demo", totalMinor: 25900, at: "2026-10-03T02:00:00Z" }]);
  });

  it("group cards: ready first, the rest after, newest first", () => {
    const s = initialState();
    const card = (id: string, state: string, minted: string) => ({ id, state, minted_at: minted, mandate_id: "mnd_1" }) as unknown as BoothState["cards"][number];
    const state: BoothState = { ...s, cards: [card("a", "USED", "2026-10-03T01:00:00Z"), card("b", "ACTIVE", "2026-10-03T02:00:00Z"), card("c", "ACTIVE", "2026-10-03T01:30:00Z")] };
    const groups = cardGroups(state);
    expect(groups.active.map((c) => c.id)).toEqual(["b", "c"]);
    expect(groups.past.map((c) => c.id)).toEqual(["a"]);
  });

  it("list only open escalations, the first to expire first", () => {
    const s = stateWith([entry(1, "log", "DECISION", decision("dec_1", "ESCALATE", "Tee", 1)), entry(2, "log", "DECISION", decision("dec_2", "ESCALATE", "Socks", 1))], "log");
    const esc = (decisionId: string, state: "OPEN" | "EXPIRED", expiresAt: string) => ({ decisionId, state, expiresAt, templateId: "R9.unverified", ruleId: "R9", openedAt: "", totalMinor: 1, merchantName: "Demo" }) as BoothState["escalations"][number];
    const state: BoothState = { ...s, escalations: [esc("dec_2", "OPEN", "2026-10-03T02:02:00Z"), esc("dec_1", "OPEN", "2026-10-03T02:01:00Z"), esc("dec_1", "EXPIRED", "2026-10-03T02:00:00Z")] };
    expect(openEscalations(state).map((e) => e.decisionId)).toEqual(["dec_1", "dec_2"]);
  });
});
