// A sealed budget that leaves clothes out: the demo shop's ideas say Outside your budget and the Demo scenarios line says the rules may
// stop the cards, on Budget and under the Ask sheet alike. A budget that names clothes (the booth's own, or all four categories) reads as before.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { draftFor, formOf, sentenceFor } from "../src/screens/onboarding/budgetModel";
import { toSealRequest } from "../src/screens/seal/sealModel";
import { bootApp, screenReady } from "./helpers/app";

const NOW = new Date("2026-10-03T02:00:00Z");
const OUTSIDE_LINE = /leaves out, so the rules may stop them/;
const USUAL_LINE = "Each one runs the real rules on a simulated shop.";

async function sealed(categories: readonly string[]) {
  const h = await bootApp("#/budget");
  const form = { ...formOf(draftFor(null, NOW), NOW), categories };
  await h.api.seal(toSealRequest(sentenceFor(form, "en", NOW), form, new Date()));
  await screenReady();
  return h;
}

const ideas = () => [...document.querySelectorAll<HTMLElement>("main [data-idea]")];

describe("a groceries-only budget", () => {
  it("marks every idea Outside your budget on Budget, and the Demo scenarios line says the rules may stop the cards", async () => {
    await sealed(["groceries"]);
    await waitFor(() => expect(document.querySelectorAll("main [data-idea][data-outside]")).toHaveLength(4));
    for (const card of ideas()) expect(card).toHaveTextContent("Outside your budget");
    expect(screen.getByText(OUTSIDE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(USUAL_LINE)).toBeNull();
  });

  it("says the same under the Ask sheet's Demo scenarios, where the usual line used to stay", async () => {
    const h = await sealed(["groceries"]);
    await h.user.click(screen.getByRole("button", { name: "What do you need?" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(OUTSIDE_LINE)).toBeInTheDocument();
    expect(within(sheet).queryByText(USUAL_LINE)).toBeNull();
  });

  it("speaks 繁 on the tag as well", async () => {
    const h = await sealed(["groceries"]);
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    await waitFor(() => expect(document.querySelector("main [data-idea][data-outside]")).toHaveTextContent("喺你嘅預算以外"));
  });
});

describe("a budget that names clothes", () => {
  it("keeps the ideas and the usual line as they were, for the booth's own budget", async () => {
    await bootApp("#/budget");
    expect(document.querySelectorAll("main [data-outside]")).toHaveLength(0);
    expect(screen.getByText(USUAL_LINE)).toBeInTheDocument();
    expect(screen.queryByText(OUTSIDE_LINE)).toBeNull();
  });

  it("keeps them for a budget with all four categories", async () => {
    await sealed(["apparel", "footwear", "electronics", "groceries"]);
    await screen.findByText("Any category");
    expect(document.querySelectorAll("main [data-outside]")).toHaveLength(0);
    expect(screen.queryByText(OUTSIDE_LINE)).toBeNull();
  });
});
