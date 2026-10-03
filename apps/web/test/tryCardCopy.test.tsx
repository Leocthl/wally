// The earbuds card among the scenarios says "Not something your rules allow" only where the budget does not name electronics. A first
// budget with all four kinds does name them: there R6 lets the earbuds through and the listing check, which is fitted on clothes,
// may ask the shopper. The card must say that, not that the rules stop them (src/screens/home/TryAsking.tsx).
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { draftFor, formOf, sentenceFor } from "../src/screens/onboarding/budgetModel";
import { toSealRequest } from "../src/screens/seal/sealModel";
import { UI } from "../src/i18n/ui";
import { bootApp, screenReady } from "./helpers/app";

const NOW = new Date("2026-10-03T02:00:00Z");
const card = (): HTMLElement => document.querySelector<HTMLElement>('main [data-scenario="off_category"]')!;

async function sealed(categories: readonly string[], stored: Record<string, string> = {}) {
  const h = await bootApp("#/budget", stored);
  const form = { ...formOf(draftFor(null, NOW), NOW), categories };
  await h.api.seal(toSealRequest(sentenceFor(form, "en", NOW), form, new Date()));
  await screenReady();
  return h;
}

describe("the earbuds card", () => {
  it("is the off-category stop on the booth's clothes-only budget", async () => {
    await bootApp("#/budget");
    expect(card()).toHaveTextContent("Earbuds on a clothes budget");
    expect(card()).toHaveTextContent("Not something your rules allow.");
  });

  it("is still that stop on a budget for clothes and shoes", async () => {
    await sealed(["apparel", "footwear"]);
    await screen.findByText("Clothes, Shoes only");
    expect(card()).toHaveTextContent("Earbuds on a clothes budget");
    expect(card()).toHaveTextContent("Not something your rules allow.");
  });

  it("says what happens on a budget that names electronics, and not that the rules stop them", async () => {
    await sealed(["apparel", "footwear", "electronics", "groceries"]);
    await screen.findByText("Any category");
    expect(card()).toHaveTextContent("Earbuds your rules allow");
    expect(card()).toHaveTextContent("The listing check is fitted on clothes, so Wally may ask you first.");
    expect(card()).not.toHaveTextContent("Not something your rules allow");
    expect(card()).not.toHaveTextContent("on a clothes budget");
    // Still the same scenario, run by the same card.
    expect(card()).toHaveAttribute("data-scenario", "off_category");
  });

  it("says it on a budget with electronics alone among the kinds, too", async () => {
    await sealed(["electronics"]);
    await screen.findByText("Electronics only");
    expect(card()).toHaveTextContent("Earbuds your rules allow");
  });

  it("is worded in 繁體", async () => {
    await sealed(["apparel", "footwear", "electronics", "groceries"], { "wally:lang": "zh-HK" });
    await screen.findByText("任何類別");
    expect(card()).toHaveTextContent(UI["home.sc.off_category.allowed"].zh);
    expect(card()).toHaveTextContent(UI["home.sc.off_category.allowed.d"].zh);
  });

  it("is the same in the Ask sheet's pills, which carry the title only", async () => {
    const h = await sealed(["apparel", "footwear", "electronics", "groceries"]);
    await h.user.click(document.querySelector<HTMLElement>(".w-tabbar__fab")!);
    const sheet = await screen.findByRole("dialog");
    const pill = within(sheet).getByRole("button", { name: /Earbuds your rules allow/ });
    expect(pill).toHaveAttribute("data-scenario", "off_category");
  });
});
