// Manifest, icons and head tags: complete, consistent with the tokens, and every declared icon exists at its size.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseThemedTokens } from "../src/design/tokenTools";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(WEB, "public");
const manifest = JSON.parse(readFileSync(resolve(PUBLIC, "manifest.webmanifest"), "utf8")) as Record<string, unknown> & { icons: { src: string; sizes: string; type: string; purpose: string }[] };
const html = readFileSync(resolve(WEB, "index.html"), "utf8");
const tokens = new Map(parseThemedTokens(readFileSync(resolve(WEB, "src/design/tokens.css"), "utf8")).map((t) => [t.name, t]));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString("ascii"), path).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("web app manifest", () => {
  it("names the app Wally and installs standalone, portrait, from ./ with scope ./", () => {
    expect(manifest).toMatchObject({ name: "Wally", short_name: "Wally", start_url: "./", scope: "./", id: "./", display: "standalone", orientation: "portrait-primary", lang: "en" });
    expect(manifest.categories).toContain("finance");
    expect(String(manifest.description)).toMatch(/simulated/i);
  });

  it("uses the token background for theme and splash colours", () => {
    expect(manifest.theme_color).toBe(tokens.get("c-bg")?.light);
    expect(manifest.background_color).toBe(tokens.get("c-bg")?.light);
  });

  it("declares any and maskable icons that exist at their declared sizes", () => {
    expect(manifest.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "192x192")).toBe(true);
    for (const icon of manifest.icons) {
      const path = resolve(PUBLIC, icon.src);
      expect(existsSync(path), icon.src).toBe(true);
      if (icon.type === "image/png") expect(pngSize(path).join("x"), icon.src).toBe(icon.sizes);
      else expect(readFileSync(path, "utf8"), icon.src).toMatch(/^<svg[^>]*viewBox/);
    }
  });

  it("keeps shortcuts inside the scope", () => {
    for (const s of manifest.shortcuts as { url: string }[]) expect(s.url.startsWith("./")).toBe(true);
  });
});

describe("index.html head", () => {
  it("has the mobile, theme and install tags, and the files they point at exist", () => {
    for (const tag of ['viewport-fit=cover', 'name="color-scheme" content="light dark"', 'name="apple-mobile-web-app-capable" content="yes"', 'name="apple-mobile-web-app-status-bar-style" content="default"', 'name="format-detection" content="telephone=no"', 'name="referrer" content="no-referrer"', '<title>Wally</title>']) expect(html).toContain(tag);
    expect(html).toContain(`<meta name="theme-color" content="${tokens.get("c-bg")?.light}" media="(prefers-color-scheme: light)" />`);
    expect(html).toContain(`<meta name="theme-color" content="${tokens.get("c-bg")?.dark}" media="(prefers-color-scheme: dark)" />`);
    expect(html).toContain(`color="${tokens.get("c-primary")?.light}"`);
    for (const m of html.matchAll(/<link [^>]*href="\/([^"]+)"/g)) expect(existsSync(resolve(PUBLIC, m[1] ?? "")), m[1]).toBe(true);
    expect(pngSize(resolve(PUBLIC, "icons/apple-touch-icon-180.png"))).toEqual([180, 180]);
  });

  it("ships an offline page with its own styles and no remote resources", () => {
    const offline = readFileSync(resolve(PUBLIC, "offline.html"), "utf8");
    expect(offline).toContain('<html lang="en">');
    expect(offline).toContain('lang="zh-HK"');
    expect(offline).not.toMatch(/(src|href)="https?:/);
    expect(offline).toMatch(/simulated/i);
  });
});
