// Generates the PWA icons and the offline page from the Wally art and tokens.css (no network, no image tools: the
// PNGs are rendered by the Chromium already in the Playwright cache). Run:
//   pnpm --filter @wally/web exec tsx scripts/gen-icons.ts
// Writes public/icons/{icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon-180.png},
// public/favicon.svg, public/mask-icon.svg and public/offline.html.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseThemedTokens } from "../src/design/tokenTools";
import { WallyArt, type WallyFills } from "../src/wally/art";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = resolve(ROOT, "public");
const tokens = new Map(parseThemedTokens(readFileSync(resolve(ROOT, "src/design/tokens.css"), "utf8")).map((t) => [t.name, t]));

function light(name: string): string {
  const v = tokens.get(name)?.light;
  if (!v) throw new Error(`token missing: --${name}`);
  return v;
}

function dark(name: string): string {
  const v = tokens.get(name)?.dark;
  if (!v) throw new Error(`token missing: --${name}`);
  return v;
}

/** White Wally with navy features: reads on the blue tile at every size. */
const WHITE = light("c-on-hero");

const INVERSE: WallyFills = {
  body: WHITE,
  flap: light("c-primary-tint"),
  card: light("wally-card"),
  stripe: light("wally-stripe"),
  face: WHITE,
  pupil: light("c-ink"),
  shadow: "none",
  spark: light("wally-card"),
  stop: light("c-stop"),
  onStop: light("c-on-stop"),
  muted: light("c-ink-muted"),
};

interface TileOptions {
  readonly size: number;
  /** Corner radius as a share of the size; 0 for full bleed (iOS and maskable icons are masked by the OS). */
  readonly radius: number;
  /** Wally's drawing size as a share of the tile. */
  readonly glyph: number;
  readonly detail: "full" | "mini";
}

function tileSvg({ size, radius, glyph, detail }: TileOptions): string {
  const g = Math.round(size * glyph);
  const x = Math.round((size - g) / 2);
  const y = Math.round((size - g) / 2 + size * 0.015);
  const art = renderToStaticMarkup(createElement(WallyArt, { state: "idle", detail, variant: "inverse", fills: INVERSE, size: g, shadow: false })).replace("<svg ", `<svg x="${x}" y="${y}" `);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<defs><linearGradient id="t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light("c-hero-from")}"/><stop offset="1" stop-color="${light("c-hero-to")}"/></linearGradient></defs>`,
    `<rect width="${size}" height="${size}" rx="${Math.round(size * radius)}" fill="url(#t)"/>`,
    art,
    `</svg>`,
  ].join("");
}

const MASK_ICON = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><mask id="m">`,
  `<rect width="120" height="120" fill="white"/><ellipse cx="46" cy="77" rx="8" ry="9" fill="black"/><ellipse cx="72" cy="77" rx="8" ry="9" fill="black"/>`,
  `</mask></defs><g mask="url(#m)" fill="black"><rect x="30" y="12" width="58" height="40" rx="7" transform="rotate(-10 58 33)"/>`,
  `<rect x="12" y="34" width="96" height="72" rx="24"/></g></svg>`,
].join("");

function offlineHtml(): string {
  const [bg, ink, muted, primary, onPrimary] = ["c-bg", "c-ink", "c-ink-muted", "c-primary", "c-on-primary"];
  const art = renderToStaticMarkup(createElement(WallyArt, { state: "offline", size: 120, fills: { ...INVERSE, body: light("wally-body"), flap: light("wally-flap"), face: light("wally-face"), pupil: light("wally-pupil"), shadow: light("wally-shadow") } }));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Wally is offline</title>
<style>
:root { color-scheme: light dark; --bg: ${light(bg)}; --ink: ${light(ink)}; --muted: ${light(muted)}; --primary: ${light(primary)}; --on-primary: ${light(onPrimary)}; }
@media (prefers-color-scheme: dark) { :root { --bg: ${dark(bg)}; --ink: ${dark(ink)}; --muted: ${dark(muted)}; --primary: ${dark(primary)}; --on-primary: ${dark(onPrimary)}; } }
body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--bg); color: var(--ink); font: 1rem/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "PingFang HK", "Noto Sans HK", sans-serif; text-align: center; }
main { padding: max(1.5rem, env(safe-area-inset-top)) 1.5rem max(1.5rem, env(safe-area-inset-bottom)); max-width: 22rem; }
h1 { font-size: 1.375rem; margin: 1rem 0 0.25rem; }
p { margin: 0; color: var(--muted); }
a { display: inline-flex; align-items: center; min-height: 3rem; margin-top: 1.5rem; padding: 0 1.5rem; border-radius: 999px; background: var(--primary); color: var(--on-primary); font-weight: 600; text-decoration: none; }
a:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
</style>
</head>
<body>
<main>
${art}
<h1>You're offline</h1>
<p>Open Wally again when you're back online. Nothing was charged: payments here are simulated.</p>
<p lang="zh-HK">你已離線。重新連線後再開啟 Wally。這裡的付款只是模擬。</p>
<a href="./">Try again</a>
</main>
</body>
</html>
`;
}

async function rasterise(svg: string, size: number, out: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  mkdirSync(resolve(PUBLIC, "icons"), { recursive: true });
  const master = tileSvg({ size: 1024, radius: 0.22, glyph: 0.8, detail: "full" });
  writeFileSync(resolve(PUBLIC, "icons/icon.svg"), master);
  writeFileSync(resolve(PUBLIC, "favicon.svg"), tileSvg({ size: 64, radius: 0.22, glyph: 0.9, detail: "mini" }));
  writeFileSync(resolve(PUBLIC, "mask-icon.svg"), MASK_ICON);
  writeFileSync(resolve(PUBLIC, "offline.html"), offlineHtml());
  await rasterise(tileSvg({ size: 192, radius: 0.22, glyph: 0.8, detail: "full" }), 192, resolve(PUBLIC, "icons/icon-192.png"));
  await rasterise(tileSvg({ size: 512, radius: 0.22, glyph: 0.8, detail: "full" }), 512, resolve(PUBLIC, "icons/icon-512.png"));
  await rasterise(tileSvg({ size: 512, radius: 0, glyph: 0.62, detail: "full" }), 512, resolve(PUBLIC, "icons/icon-maskable-512.png"));
  await rasterise(tileSvg({ size: 180, radius: 0, glyph: 0.78, detail: "full" }), 180, resolve(PUBLIC, "icons/apple-touch-icon-180.png"));
  process.stdout.write("icons and offline page written\n");
}

await main();
