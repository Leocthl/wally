// The rule tag for what a budget can buy (screens/home/hero/heroParts.tsx categoriesText): "Any category" when the budget names
// all four categories Wally knows, "Clothes, Shoes only" for fewer. The budget card on Home and the Check and lock in summary
// share it, so both read the same.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { allowsAnyCategory, categoriesText } from "../src/screens/home/BudgetHero";
import { draftFor, formOf, sentenceFor } from "../src/screens/onboarding/budgetModel";
import { toSealRequest } from "../src/screens/seal/sealModel";
import { UI } from "../src/i18n/ui";
import { bootApp, screenReady } from "./helpers/app";

const en = (p: { readonly en: string; readonly zh: string }): string => p.en;
const zh = (p: { readonly en: string; readonly zh: string }): string => p.zh;
const FOUR = ["apparel", "footwear", "electronics", "groceries"];
const NOW = new Date("2026-10-03T02:00:00Z");

describe("allowsAnyCategory", () => {
  it("is true when all four categories are named, in any order", () => {
    expect(allowsAnyCategory(FOUR)).toBe(true);
    expect(allowsAnyCategory([...FOUR].reverse())).toBe(true);
    expect(allowsAnyCategory(["groceries", "apparel", "footwear", "electronics"])).toBe(true);
  });

  it("is false for fewer than four, and for none", () => {
    expect(allowsAnyCategory([])).toBe(false);
    for (const slug of FOUR) expect(allowsAnyCategory([slug]), slug).toBe(false);
    for (const left of FOUR) expect(allowsAnyCategory(FOUR.filter((s) => s !== left)), `without ${left}`).toBe(false);
  });

  it("is false when a category Wally does not know is named beside the four: that is a limit the person should see", () => {
    expect(allowsAnyCategory([...FOUR, "toys"])).toBe(false);
    expect(categoriesText([...FOUR, "toys"], en)).toBe("Clothes, Shoes, Electronics, Groceries, toys only");
  });
});

describe("categoriesText", () => {
  it("reads Any category (任何類別) for all four", () => {
    expect(categoriesText(FOUR, en)).toBe("Any category");
    expect(categoriesText(FOUR, zh)).toBe("任何類別");
    expect(UI["home.anyCategory"]).toEqual({ en: "Any category", zh: "任何類別" });
  });

  it("keeps the list with only for fewer than four", () => {
    expect(categoriesText(["apparel"], en)).toBe("Clothes only");
    expect(categoriesText(["apparel", "footwear"], en)).toBe("Clothes, Shoes only");
    expect(categoriesText(["apparel", "footwear", "groceries"], en)).toBe("Clothes, Shoes, Groceries only");
    expect(categoriesText(["apparel"], zh)).toBe("只限衣物");
    expect(categoriesText(["footwear", "groceries"], zh)).toBe("只限鞋、雜貨");
  });
});

describe("the budget card on Home", () => {
  async function sealed(categories: readonly string[]) {
    const h = await bootApp("#/budget");
    const form = { ...formOf(draftFor(null, NOW), NOW), categories };
    await h.api.seal(toSealRequest(sentenceFor(form, "en", NOW), form, new Date()));
    await screenReady();
    return h;
  }
  const tags = () => within(screen.getByRole("list", { name: "Rules Wally must follow" })).getAllByRole("listitem").map((li) => li.textContent);

  it("says Any category when the budget names all four", async () => {
    await sealed(FOUR);
    await screen.findByText("Any category");
    expect(tags()).toEqual(["Any category", "Verified sellers", "Signed rules"]);
  });

  it("keeps the list with only when the budget names three", async () => {
    await sealed(["apparel", "footwear", "groceries"]);
    await screen.findByText("Clothes, Shoes, Groceries only");
    expect(tags()[0]).toBe("Clothes, Shoes, Groceries only");
  });

  it("says Clothes only for the booth's ready-made budget", async () => {
    await bootApp("#/budget");
    expect(tags()[0]).toBe("Clothes only");
  });
});
