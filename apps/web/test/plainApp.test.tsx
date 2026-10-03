// The whole app in plain words, which is the default: after purchases have run and a receipt has been changed, every screen
// a visitor can reach holds no number without a chip, no bare figure, none of the words only engineers use (outside a
// closed "Show the details" or "Details for nerds"), and no internal entry kind anywhere, closed disclosures included.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bootApp, go, press, type Harness } from "./helpers/app";
import { bareFigures, numsWithoutChip } from "./helpers/figures";

vi.setConfig({ testTimeout: 60_000 });

/** An entry kind the log uses internally, as a word or as the quoted field. */
const ENTRY_KINDS = /MANDATE_SEALED|MANDATE_REVOKED|PACKET_EXPIRED|CARD_MINTED|CARD_EVENT|"kind"|\bDECISION\b/;
/** Words that mean something only to the people who built it. */
const ENGINEERS = /\b(mandate|packet|mint(ed|s|ing)?|hash(es)?|JSONL?|payload|checkpoint|delegator|did:key|B0|B1|B2|p50|p95|F38|T-H\d|seed|commit)\b|\bR\d{1,2}\b/i;

/** What a person can read now: closed disclosures and hidden parts are left out. */
function visibleText(root: ParentNode): string {
  const clone = (root as Element).cloneNode(true) as Element;
  clone.querySelectorAll("details:not([open]) > :not(summary), [hidden], script, style, .sr-only").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ");
}

async function scenarios(h: Harness): Promise<void> {
  for (const id of ["normal", "flagged", "overflow", "unverified"]) await press(h, id);
}

describe("the whole app in plain words", () => {
  it("Budget, Wally, Receipts and a receipt stay plain and honest", async () => {
    const h = await bootApp();
    await scenarios(h);
    await go("#/budget");
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);
    expect(document.body.textContent ?? "").not.toMatch(ENTRY_KINDS);
    await go("#/receipts");
    await waitFor(() => expect(document.querySelectorAll(".rc-row").length).toBeGreaterThan(3));
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);
    expect(document.body.textContent ?? "").not.toMatch(ENTRY_KINDS);
    await h.user.click(document.querySelector<HTMLElement>(".rc-row .w-row__hit") as HTMLElement);
    const sheet = await screen.findByRole("dialog");
    expect(document.body.textContent ?? "").not.toMatch(ENTRY_KINDS);
    expect(visibleText(sheet)).not.toMatch(ENGINEERS);
    expect(bareFigures(sheet)).toEqual([]);
    expect(numsWithoutChip(sheet)).toEqual([]);
  });

  it("Proof checks itself on opening, says which receipt a change touched in words, and goes back", async () => {
    const h = await bootApp();
    await scenarios(h);
    await go("#/proof");
    const card = (): HTMLElement => document.querySelector<HTMLElement>(".pf-card") as HTMLElement;
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
    expect(card()).toHaveTextContent(/All \d+ receipts are untouched/);
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);
    expect(document.body.textContent ?? "").not.toMatch(ENTRY_KINDS);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);

    await h.user.click(screen.getByRole("button", { name: "Try changing one receipt" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "fail"));
    expect(card()).toHaveTextContent(/Receipt \d+ was changed/);
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);
    expect(document.body.textContent ?? "").not.toMatch(ENTRY_KINDS);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);

    await h.user.click(screen.getByRole("button", { name: "Put it back" }));
    await waitFor(() => expect(card()).toHaveAttribute("data-status", "pass"));
  });

  it("Evidence and About stay plain too", async () => {
    const h = await bootApp();
    await go("#/evidence");
    expect(visibleText(document.body)).not.toMatch(ENGINEERS);
    expect(document.body.textContent ?? "").not.toMatch(ENTRY_KINDS);
    expect(bareFigures(document.body)).toEqual([]);
    expect(numsWithoutChip(document.body)).toEqual([]);
    await go("#/budget");
    await h.user.click(screen.getByRole("button", { name: /About and settings/ }));
    const about = await screen.findByRole("dialog", { name: "About Wally" });
    expect(visibleText(about)).not.toMatch(ENGINEERS);
    expect(within(about).queryByText("Technical notes")).toBeNull();
  });
});
