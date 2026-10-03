// No internal entry kind outside developer mode. MANDATE_SEALED, MANDATE_REVOKED, DECISION, CARD_MINTED, CARD_EVENT and
// PACKET_EXPIRED (and the quoted "kind" field) are names the log uses for itself. In plain mode they must not be anywhere
// in the text of Proof or Receipts, closed "Show the details" included, so the plain details hold the receipt's facts and
// the rule results but never the raw receipt. Developer mode still shows them in the raw entry.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VerifyOutcome } from "../src/api/types";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { ReceiptsScreen } from "../src/screens/proof/ReceiptsScreen";
import { developerMode } from "./helpers/devMode";
import { delegate, instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 60_000 });

const KINDS = ["MANDATE_SEALED", "MANDATE_REVOKED", "DECISION", "CARD_MINTED", "CARD_EVENT", "PACKET_EXPIRED", '"kind"'] as const;

/** A paid purchase, a stop, a question, an open card and then the budget cancelled: every kind of receipt the mock makes. */
const STEPS = ["small", "flagged", "unverified", "mint", "REVOKE"] as const;

function kindsIn(text: string): string[] {
  return KINDS.filter((kind) => text.includes(kind));
}

const bodyText = (): string => document.body.textContent ?? "";

async function openEveryRow(user: Awaited<ReturnType<typeof mountScreen>>["user"]): Promise<void> {
  for (const summary of document.querySelectorAll<HTMLElement>(".pf-tl__summary")) await user.click(summary);
}

describe("Proof (plain) never names an entry kind", () => {
  it.each(["ready to check", "untouched", "a changed copy"] as const)("when %s, with every receipt's details open", async (state) => {
    const { api, clock } = instantMock();
    await seed(api, clock, STEPS);
    const down = async (): Promise<VerifyOutcome> => {
      throw new Error("down");
    };
    const { user } = await mountScreen(<ProofScreen />, state === "ready to check" ? delegate(api, { verify: down }) : api, { hash: "#/proof" });
    if (state === "ready to check") await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "idle"));
    else await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "pass"));
    if (state === "a changed copy") {
      await user.click(screen.getByRole("button", { name: "Try changing one receipt" }));
      await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "fail"));
    }
    expect(kindsIn(bodyText())).toEqual([]);
    await openEveryRow(user);
    expect(document.querySelectorAll(".pf-tl__details").length).toBe(document.querySelectorAll(".pf-tl__item").length);
    expect(document.querySelector(".pf-tl pre")).toBeNull();
    expect(kindsIn(bodyText())).toEqual([]);
  });

  it("including the how-it-is-checked and save sheets", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, STEPS);
    const exportLog = async () => ({ log: '{"seq":0}', publicKeys: { note: "x", engine: [], delegator: "d", agent: "a" }, checkpoint: null });
    const { user } = await mountScreen(<ProofScreen />, delegate(api, { exportLog }), { hash: "#/proof" });
    await waitFor(() => expect(document.querySelector(".pf-card")).toHaveAttribute("data-status", "pass"));
    await user.click(screen.getAllByRole("button", { name: "How is this checked?" })[0]!);
    expect(kindsIn(bodyText())).toEqual([]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Save a copy of the receipts" }));
    await screen.findByRole("dialog", { name: "Save the receipts" });
    expect(kindsIn(bodyText())).toEqual([]);
  });
});

describe("Receipts (plain) never names an entry kind", () => {
  it("in the list, and in the sheet of every kind of receipt, closed details included", async () => {
    const { api, clock } = instantMock();
    await seed(api, clock, STEPS);
    const entries = (await api.getLog()).entries;
    const seen = new Set(entries.map((e) => `${e.kind}${e.kind === "CARD_EVENT" ? `:${e.payload.event}` : e.kind === "DECISION" ? `:${e.payload.outcome}` : ""}`));
    for (const needed of ["MANDATE_SEALED", "MANDATE_REVOKED", "CARD_MINTED", "DECISION:APPROVE", "DECISION:DENY", "DECISION:ESCALATE", "CARD_EVENT:AUTHORISED", "CARD_EVENT:VOIDED"]) expect(seen.has(needed), needed).toBe(true);
    const { user } = await mountScreen(<ReceiptsScreen />, api, { hash: "#/receipts" });
    await waitFor(() => expect(document.querySelectorAll(".rc-row")).toHaveLength(entries.length));
    expect(kindsIn(bodyText())).toEqual([]);
    for (const entry of entries) {
      await user.click(document.querySelector(`[data-seq="${entry.seq}"]`)!.closest("button")!);
      const sheet = await screen.findByRole("dialog");
      expect(sheet.querySelector("details"), `receipt ${entry.seq + 1}`).not.toBeNull();
      expect(sheet.querySelector("pre")).toBeNull();
      expect(kindsIn(bodyText()), `receipt ${entry.seq + 1} (${entry.kind})`).toEqual([]);
      await user.click(within(sheet).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});

describe("developer mode still shows the kinds, in the raw entry", () => {
  it("Receipts: the raw entry holds the kind and the quoted field", async () => {
    developerMode();
    const { api, clock } = instantMock();
    await seed(api, clock, STEPS);
    const entries = (await api.getLog()).entries;
    const { user } = await mountScreen(<ReceiptsScreen />, api, { hash: "#/receipts" });
    await waitFor(() => expect(document.querySelectorAll(".rc-row")).toHaveLength(entries.length));
    const stop = entries.find((e) => e.kind === "DECISION" && e.payload.outcome === "DENY")!;
    await user.click(document.querySelector(`[data-seq="${stop.seq}"]`)!.closest("button")!);
    const sheet = await screen.findByRole("dialog");
    const raw = sheet.querySelector('[data-disclosure="raw"]')!;
    expect(raw.textContent).toContain('"kind": "DECISION"');
    expect(kindsIn(raw.textContent ?? "")).toContain("DECISION");
    expect(sheet.querySelector('[data-disclosure="details"]')).not.toBeNull();
  });
});
