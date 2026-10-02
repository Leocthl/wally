// Branding guard and language rules (docs/04 Branding guard, Fonts): no emoji, no logos or lookalikes, the SIMULATED
// note on every screen, the footer in About, and lang="zh-HK" on every Chinese run (also with the 繁 view switched on).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { bootApp, go, press } from "./helpers/app";

vi.setConfig({ testTimeout: 20_000 });

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("source files", () => {
  const all = files(SRC);

  it("contain no emoji", () => {
    for (const file of all) expect(readFileSync(file, "utf8"), file).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("ship no raster, vector or font assets (no logos, no lookalike marks)", () => {
    expect(all.filter((f) => /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(f))).toEqual([]);
    for (const file of all.filter((f) => f.endsWith(".css"))) expect(readFileSync(file, "utf8"), file).not.toMatch(/url\(/);
  });

  it("name HKT, Tap & Go and Mastercard only in the footer line", () => {
    const hits = all.filter((f) => /\.(tsx?|css)$/.test(f)).filter((f) => /Mastercard|Tap & Go/.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => f.slice(SRC.length + 1))).toEqual(["i18n/strings.ts"]);
  });

  it("use no purple gradient or glass effect", () => {
    for (const file of all.filter((f) => f.endsWith(".css"))) expect(readFileSync(file, "utf8"), file).not.toMatch(/gradient\([^)]*(purple|violet|#[89a-f][0-9a-f]{0,2}[0-9a-f]{3}ff)|backdrop-filter/i);
  });
});

describe("rendered screens", () => {
  it.each(["#/booth", "#/budget", "#/wally", "#/receipts", "#/proof", "#/seal", "#/presenter", "#/run", "#/console", "#/log"])("%s shows the SIMULATED note in the top bar, with no images", async (hash) => {
    await bootApp(hash);
    expect(screen.getByRole("note")).toHaveTextContent("Simulated. No money moves.");
    expect(document.querySelectorAll("img, picture, video, canvas, object, embed")).toHaveLength(0);
    for (const svg of document.querySelectorAll("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the prototype footer and the SIMULATED rail line in the About sheet", async () => {
    const h = await bootApp("#/budget");
    await h.user.click(screen.getByRole("button", { name: /About and settings/ }));
    expect(await screen.findByText("Prototype. Not affiliated with HKT, Tap & Go or Mastercard.")).toBeInTheDocument();
    expect(screen.getByText("The rail is SIMULATED. No money moves.")).toBeInTheDocument();
  });

  it("marks every Chinese run lang=zh-HK, after the app has shown every kind of content", async () => {
    const h = await bootApp("#/booth");
    for (const id of ["normal", "flagged", "overflow", "unverified", "overshoot", "replay", "wrong_merchant", "drift", "timeout"]) await press(h, id);
    await h.user.click(screen.getByRole("radio", { name: "繁體中文" }));
    await go("#/budget");
    // CJK punctuation, ideographs and full-width forms, written with \u escapes (the \u3000 space would trip no-irregular-whitespace).
    const cjk = new RegExp("[\\u3000-\\u303f\\u3400-\\u9fff\\uff00-\\uffef]");
    const bad: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      if (!cjk.test(text)) continue;
      const lang = node.parentElement?.closest("[lang]")?.getAttribute("lang");
      if (lang !== "zh-HK") bad.push(text.trim().slice(0, 40));
    }
    expect(bad).toEqual([]);
  });

  it("puts the English line first and the zh-HK line second in every bilingual pair", async () => {
    await bootApp("#/booth");
    for (const pair of document.querySelectorAll(".bi")) {
      expect(pair.children[0]?.className).toBe("bi__en");
      expect(pair.children[1]?.getAttribute("lang")).toBe("zh-HK");
    }
  });
});
