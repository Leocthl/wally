// The buy bar under the photo sheet: what Wally would be asked to buy, the one-off card amount with its SIMULATED chip, the sentence
// about the rules, and the Buy button. The words sit in their own region so that at large text they scroll and the button stays
// on the screen; that region is a tab stop (with a shade at the cut edge) only while it really scrolls.
import type { ShopMatch } from "../src/api/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuyBar } from "../src/screens/photo/BuyBar";

const MATCH: ShopMatch = {
  listingId: "lst_photoHoodieNavy",
  kind: "hoodie",
  colors: ["navy"],
  pattern: "plain",
  fit: "relaxed",
  style: ["streetwear"],
  merchantName: "Demo Outlet (SIMULATED)",
  priceMinor: 34_900,
  totalMinor: 37_900,
  score: 92,
  reasons: ["same_kind", "close_color"],
};

/** The region that holds the words (and scrolls at large text). */
const region = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('[data-slot="photo-buy-text"]');
  if (found === null) throw new Error("the buy bar has no region for its words");
  return found;
};

const renderBar = (): void => void render(<BuyBar match={MATCH} busy={false} onBuy={() => undefined} />);

afterEach(() => vi.restoreAllMocks());

describe("BuyBar", () => {
  it("says what would be bought, from which shop, for how much, and that the rules still check", () => {
    renderBar();
    const bar = document.querySelector('[data-slot="photo-buy"]');
    expect(bar).toHaveTextContent("Ask Wally to buy: Navy relaxed hoodie");
    expect(bar).toHaveTextContent("Demo Outlet");
    expect(bar).not.toHaveTextContent("(SIMULATED)");
    expect(bar).toHaveTextContent("One-off card for");
    expect(bar).toHaveTextContent("HK$379");
    expect(bar).toHaveTextContent("SIMULATED");
    expect(bar).toHaveTextContent("Wally still checks the rules before any card is made.");
  });

  it("keeps the words and the button as two parts, the button last", () => {
    renderBar();
    const button = screen.getByRole("button", { name: "Ask Wally to buy this" });
    expect(region()).toHaveTextContent("Wally still checks the rules");
    expect(region()).not.toContainElement(button);
    expect(region().compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("buys when the button is pressed, and not while the booth is busy", async () => {
    const onBuy = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<BuyBar match={MATCH} busy={false} onBuy={onBuy} />);
    await user.click(screen.getByRole("button", { name: "Ask Wally to buy this" }));
    expect(onBuy).toHaveBeenCalledTimes(1);
    unmount();
    render(<BuyBar match={MATCH} busy onBuy={onBuy} />);
    await user.click(screen.getByRole("button", { name: "Ask Wally to buy this" }));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it("adds no tab stop and no shade while the words fit (jsdom has no layout: both heights are 0)", () => {
    renderBar();
    expect(region()).not.toHaveAttribute("tabindex");
    expect(region()).not.toHaveAttribute("data-scrolls");
  });

  it("makes the words a tab stop with a shade while they are taller than the room", () => {
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(300);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(120);
    renderBar();
    expect(region()).toHaveAttribute("tabindex", "0");
    expect(region()).toHaveAttribute("data-scrolls", "true");
  });
});
