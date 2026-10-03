// Plain Proof, the words a person can read. Walks the visible text of the screen in every state (ready to check, checking,
// untouched, a changed copy, put back), in English and zh-HK, and looks for the machinery: hashes, JSON, failure codes,
// rule ids, "#4" numbers, engine, checkpoint. What sits inside a receipt's opened "Show the details" is the one place
// they may appear, so the walk skips it.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VerifyOutcome } from "../src/api/types";
import { ProofScreen } from "../src/screens/proof/ProofScreen";
import { delegate, instantMock, mountScreen, seed } from "./helpers/proofHarness";

vi.setConfig({ testTimeout: 20_000 });

const MACHINERY_EN: readonly (readonly [string, RegExp])[] = [
  ["hash", /\bhash(es)?\b/i],
  ["hex fingerprint", /[0-9a-f]{8,}/i],
  ["JSON", /\bjsonl?\b/i],
  ["seq", /\bseq\b/i],
  ["payload", /\bpayload\b/i],
  ["engine", /\bengine\b/i],
  ["delegator", /\bdelegator\b/i],
  ["mandate", /\bmandate\b/i],
  ["packet", /\bpacket\b/i],
  ["mint", /\bmint(ed|s|ing)?\b/i],
  ["byte", /\bbytes?\b/i],
  ["checkpoint", /\bcheckpoints?\b/i],
  ["entry", /\b(entry|entries)\b/i],
  ["failure code", /\b[A-Z]{2,}(_[A-Z]+)+\b/],
  ["rule id", /\bR\d{1,2}\b/],
  ["#4-style id", /#\d+/],
];
const MACHINERY_ZH: readonly (readonly [string, RegExp])[] = [
  ["hex fingerprint", /[0-9a-f]{8,}/i],
  ["JSON", /JSON/i],
  ["雜湊", /雜湊/],
  ["引擎", /引擎/],
  ["委託人", /委託人/],
  ["檢查點", /檢查點/],
  ["位元組", /位元組/],
  ["紀錄", /紀錄/],
  ["failure code", /\b[A-Z]{2,}(_[A-Z]+)+\b/],
  ["rule id", /\bR\d{1,2}\b/],
  ["#4-style id", /#\d+/],
];

/** Everything a person sees on the screen, except what an opened receipt discloses. */
function visibleText(root: Element): string {
  const parts: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement;
    if (!owner || owner.closest("script,style,[hidden]")) continue;
    if (owner.closest(".pf-tl__details")) continue;
    parts.push(node.textContent ?? "");
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const card = (): HTMLElement => document.querySelector<HTMLElement>(".pf-card")!;
const wait = (status: string) => waitFor(() => expect(card()).toHaveAttribute("data-status", status));

type State = "ready to check" | "checking" | "untouched" | "changed copy" | "put back";
const STATES: readonly State[] = ["ready to check", "checking", "untouched", "changed copy", "put back"];

async function reach(state: State, locale: "en" | "zh-HK") {
  const { api, clock } = instantMock();
  await seed(api, clock, ["normal", "flagged"]);
  const never = new Promise<VerifyOutcome>(() => undefined);
  const down = async (): Promise<VerifyOutcome> => {
    throw new Error("down");
  };
  const overrides = state === "checking" ? { verify: () => never } : state === "ready to check" ? { verify: down } : {};
  const view = await mountScreen(<ProofScreen />, delegate(api, overrides), { hash: "#/proof", locale });
  const t = (en: string, zh: string): string => (locale === "en" ? en : zh);
  if (state === "ready to check") await wait("idle");
  if (state === "checking") await wait("checking");
  if (state === "untouched") await wait("pass");
  if (state === "changed copy" || state === "put back") {
    await wait("pass");
    await view.user.click(screen.getByRole("button", { name: t("Try changing one receipt", "試改動一張收據") }));
    await wait("fail");
  }
  if (state === "put back") {
    await view.user.click(screen.getByRole("button", { name: t("Put it back", "還原") }));
    await wait("pass");
  }
  return view;
}

describe.each([["en", MACHINERY_EN], ["zh-HK", MACHINERY_ZH]] as const)("Proof (plain) in %s shows no machinery", (locale, banned) => {
  it.each(STATES)("when %s", async (state) => {
    await reach(state, locale);
    const root = document.querySelector('[data-screen="proof"]')!;
    const text = visibleText(root);
    expect(text.length).toBeGreaterThan(40);
    for (const [name, pattern] of banned) expect(text, `${name} in: ${text}`).not.toMatch(pattern);
  });
});

describe("Proof (plain): titles", () => {
  it("never title anything with a signature, a hash or a code", async () => {
    await reach("changed copy", "en");
    const titles = [...document.querySelectorAll(".pf-card__title, .pf-tl__title, h1, h2, h3, [role='heading']")].map((e) => e.textContent ?? "");
    expect(titles.length).toBeGreaterThan(3);
    for (const title of titles) expect(title, title).not.toMatch(/signature|hash|[0-9a-f]{8}|[A-Z]+_[A-Z]+/i);
  });

  it("keeps the rule id and the code out of the text even when the failed receipt's details are opened elsewhere", async () => {
    const view = await reach("changed copy", "en");
    const summary = document.querySelectorAll(".pf-tl__item")[1]!.querySelector("summary")!;
    await view.user.click(summary);
    const text = visibleText(document.querySelector('[data-screen="proof"]')!);
    expect(text).not.toMatch(/PAYLOAD_HASH/);
    expect(document.querySelector(".pf-tl__details")).toHaveTextContent("PAYLOAD_HASH");
  });
});
