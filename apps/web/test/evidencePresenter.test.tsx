// Presenter DM8 (big numbers, acceptance, wiring banner) and DM9 (where it breaks, who holds the loss, path to HKT),
// plus the stylesheet rules this lane owns: stage numerals at --fs-6, tokens only, no motion.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRESENTER_SCRIPT } from "../src/booth/presenterScript";
import { Dm8View, Dm9Card } from "../src/evidence/components/PresenterBeats";
import { DM9 } from "../src/evidence/dm9";
import { DM9_PLAIN } from "../src/evidence/dm9Plain";
import { parseHarnessFile } from "../src/evidence/harnessGuard";
import { bootApp } from "./helpers/app";
import { CLEAN, honestyProblems } from "./evidenceFigures";
import { harnessFile } from "./evidenceFixtures";
import { developerMode } from "./helpers/devMode";
import { ENGINEERS, visibleText } from "./helpers/plainWords";

vi.setConfig({ testTimeout: 30_000 });

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/evidence/evidence.css"), "utf8");

async function stepTo(h: Awaited<ReturnType<typeof bootApp>>, moment: string): Promise<void> {
  const target = PRESENTER_SCRIPT.findIndex((s) => s.moment === moment);
  for (let i = 0; i <= target; i += 1) {
    const step = screen.getByRole("button", { name: /^Step/ });
    await waitFor(() => expect(step).toBeEnabled());
    await h.user.click(step);
  }
}

describe("presenter DM8 and DM9", () => {
  it("DM8 shows three big numbers with k/n and chips, T-H1 and T-H2, and the banner when the run is wiring-only", async () => {
    developerMode();
    const h = await bootApp("#/presenter");
    await stepTo(h, "DM8");
    const beat = await screen.findByText("Model-only gate against the full pipeline");
    const view = beat.closest('[data-beat="DM8"]')!;
    expect(view.querySelectorAll("[data-big]")).toHaveLength(3);
    expect(view.querySelector(".ev-big--stage")).not.toBeNull();
    expect(view.querySelector('[data-acceptance="T-H1"]')).not.toBeNull();
    const wiring = view.querySelector(".ev-big")?.getAttribute("data-wiring") === "true";
    expect(view.querySelector("[data-wiring-banner]") !== null).toBe(wiring);
    expect(honestyProblems(view)).toEqual(CLEAN);
  });

  it("DM9 shows where it breaks, who holds the loss and the path to HKT, citing register IDs (the developer view)", async () => {
    developerMode();
    const h = await bootApp("#/presenter");
    await stepTo(h, "DM9");
    const view = (await screen.findByRole("region", { name: /Where it breaks/ })).closest('[data-beat="DM9"]')!;
    expect(view.querySelectorAll("[data-dm9]")).toHaveLength(3);
    expect(view).toHaveTextContent("Not found in public sources");
    expect(view.textContent).not.toMatch(/does not have/i);
    expect(view.textContent).toMatch(/\[F1\]/);
    expect(honestyProblems(view)).toEqual(CLEAN);
  });

  it("DM8 on a live all-real run shows no banner; with no readable run it says so and shows no figure", () => {
    developerMode();
    const parsed = parseHarnessFile("h.json", harnessFile());
    if (!parsed.ok) throw new Error("parse");
    const { container, unmount } = render(<Dm8View harness={{ items: [parsed.value], unreadable: [] }} />);
    expect(container.querySelector("[data-wiring-banner]")).toBeNull();
    unmount();
    const empty = render(<Dm8View harness={{ items: [], unreadable: [] }} />);
    expect(empty.container.querySelectorAll("[data-num]")).toHaveLength(0);
    expect(empty.container).toHaveTextContent("No harness result could be read");
  });

  it("DM9 is static template text in both modes: no figure without a chip, and no product name or brand mark", () => {
    for (const developer of [false, true]) {
      if (developer) developerMode();
      const { container, unmount } = render(<Dm9Card />);
      expect(container.querySelector("[data-beat]")).toHaveAttribute("data-mode", developer ? "developer" : "plain");
      expect(honestyProblems(container)).toEqual(CLEAN);
      expect(container.textContent).not.toMatch(/Mastercard|Tap & Go|lai see|red packet/i);
      unmount();
    }
  });
});

describe("presenter DM9 in plain words, the default", () => {
  it("keeps the same three columns and one line for each line of the developer card, so no claim is added or dropped", () => {
    expect(DM9_PLAIN.map((c) => c.id)).toEqual(DM9.map((c) => c.id));
    expect(DM9_PLAIN.map((c) => c.lines.length)).toEqual(DM9.map((c) => c.lines.length));
  });

  it("says it without register IDs, rule IDs, model names or protocol words, and with no digit that would need a chip", async () => {
    const h = await bootApp("#/presenter");
    await stepTo(h, "DM9");
    const view = (await screen.findByRole("region", { name: /Where it breaks/ })).closest('[data-beat="DM9"]') as HTMLElement;
    expect(view).toHaveAttribute("data-mode", "plain");
    expect(view.querySelectorAll("[data-dm9]")).toHaveLength(3);
    expect(view).toHaveTextContent("Not found in public sources");
    const text = visibleText(view);
    expect(text).not.toMatch(ENGINEERS);
    expect(text).not.toMatch(/\[|\]|\bF\d|\bI\d|Laya|Qwen|did:key|\brail\b|\bjudge\b|does not have/i);
    expect(text).not.toMatch(/\bDIDs?\b|\bDENY\b|\bESCALATE\b|\bAPI\b|\bSIMULATED\b|\bASSUMED\b/); // the codes, not the plain words ("simulated")
    expect(text).not.toMatch(/\d/);
    expect(honestyProblems(view)).toEqual(CLEAN);
  });

  it("keeps the honest limits in words: simulated card, assumed settings, the wrong block, and what is not claimed", () => {
    const all = DM9_PLAIN.flatMap((c) => [...c.lines, c.foot]).map((l) => l.en).join(" ");
    expect(all).toContain("The card is simulated");
    expect(all).toContain("settings are assumed");
    expect(all).toContain("wrong block");
    expect(all).toContain("We make no claim about that pilot's results");
    expect(all).toContain("Not affiliated with HKT");
    expect(all).toContain("can only make a decision stricter");
  });
});

describe("presenter DM8 in plain words, the default", () => {
  it("shows the headline and the four cards that carry the claim, each number with its chip and each zero with its limit", async () => {
    const h = await bootApp("#/presenter");
    await stepTo(h, "DM8");
    const view = (await waitFor(() => {
      const found = document.querySelector('[data-beat="DM8"]');
      if (!found) throw new Error("no DM8 yet");
      return found as HTMLElement;
    }));
    expect(view).toHaveAttribute("data-mode", "plain");
    expect(view.querySelector("h2")?.textContent).toMatch(/^On our own test set, Wally /);
    const ids = [...view.querySelectorAll("[data-plain-card]")].map((n) => n.getAttribute("data-plain-card"));
    expect(ids.slice(0, 1)).toEqual(["hero"]);
    expect(ids).toEqual(expect.arrayContaining(["limit", "risky", "honest"]));
    expect(ids).not.toContain("speed");
    expect(view.querySelector(".evp-stage__cards")).not.toBeNull();
    expect(view.querySelector("[data-big]")).toBeNull();
    expect(view.querySelector('a[href="#/evidence"]')).not.toBeNull();
    expect(honestyProblems(view)).toEqual(CLEAN);
    expect(view.textContent ?? "").not.toMatch(/\b(B0|B1|B2|CI|p50|p95|T-H\d|F38|seed|commit)\b/);
  });

  it("says so when no run can be read, and shows no figure", () => {
    const { container } = render(<Dm8View harness={{ items: [], unreadable: [] }} />);
    expect(container.querySelectorAll("[data-num]")).toHaveLength(0);
    expect(container).toHaveTextContent("No test results could be read");
  });
});

describe("evidence stylesheet", () => {
  // Updated deliberately (lane b-proof): the Wally type scale's --text-5xl (3.75rem) replaces the legacy --fs-6 alias,
  // which phase B removes; the floor stays "about 60 px on stage".
  it("puts stage numerals at --text-5xl (or the legacy --fs-6) or larger", () => {
    expect(CSS).toMatch(/\.ev-big--stage \.ev-big__kn\s*\{\s*font-size:\s*var\(--(fs-[67]|text-5xl)\)/);
  });

  it("uses tokens only: no literal colours", () => {
    expect(CSS.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });

  it("moves only inside a no-preference block (a bar wiping in once), so reduced motion holds", () => {
    const marker = "@media (prefers-reduced-motion: no-preference)";
    let rest = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    for (let at = rest.indexOf(marker); at !== -1; at = rest.indexOf(marker)) {
      let depth = 0;
      let end = rest.indexOf("{", at);
      for (let i = end; i < rest.length; i += 1) {
        if (rest[i] === "{") depth += 1;
        else if (rest[i] === "}" && (depth -= 1) === 0) {
          end = i;
          break;
        }
      }
      rest = rest.slice(0, at) + rest.slice(end + 1);
    }
    expect(rest).not.toMatch(/animation|transition|infinite/);
    expect(CSS).not.toMatch(/infinite/);
  });

  it("keeps the tables inside the screen on a phone (stacked cards under the wide breakpoint)", () => {
    expect(CSS).toMatch(/@media \(max-width: 47\.99rem\)[\s\S]*\.ev table[\s\S]*display: block/);
  });
});
