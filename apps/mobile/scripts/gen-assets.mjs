#!/usr/bin/env node
// Renders the icon and splash masters from apps/web/public/icons/icon.svg into apps/mobile/assets, then runs
// @capacitor/assets to write the iOS and Android icon sets and splash screens into the native projects.
// Needs the platforms added (cap add ios, cap add android). Run: pnpm --filter @laisee/mobile assets
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BG_DARK, BG_LIGHT } from "./colors.mjs";

const mobile = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = join(mobile, "assets");
const SIZE = 1024;
const SPLASH = 2732;
/** The tile in the splash, as a share of the splash side. */
const SPLASH_TILE = 480;
/** Wally's width on the Android adaptive foreground. @capacitor/assets insets each layer by 16.7% itself, so the art fills the layer up to its inscribed circle (radius 0.44 of the side). */
const FOREGROUND_ART = 940;
/** Wally's centre inside its 120 unit drawing box. */
const ART_CENTRE = { x: 60, y: 59 };

const svg = readFileSync(resolve(mobile, "../web/public/icons/icon.svg"), "utf8");
const artStart = svg.indexOf("<svg", svg.indexOf("<svg") + 4);
const close = svg.lastIndexOf("</svg>");
if (artStart < 0 || close < artStart) throw new Error("icon.svg changed shape: expected the artwork as a nested <svg>");
const head = svg.slice(0, artStart);
const art = svg.slice(artStart, close);

/** The tile with square corners: iOS and the Android legacy launcher mask it themselves. */
const squareTile = svg.replace(/\brx="\d+"/, 'rx="0"');
const backgroundLayer = `${head.replace(/\brx="\d+"/, 'rx="0"')}</svg>`;

function placeArt(tag, x, y, width) {
  return tag.replace(/^<svg[^>]*>/, (open) =>
    open
      .replace(/\bx="[^"]*"/, `x="${x.toFixed(1)}"`)
      .replace(/\by="[^"]*"/, `y="${y.toFixed(1)}"`)
      .replace(/\bwidth="[^"]*"/, `width="${width}"`)
      .replace(/\bheight="[^"]*"/, `height="${width}"`),
  );
}

const unit = FOREGROUND_ART / 120;
const foregroundLayer = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${placeArt(
  art,
  SIZE / 2 - ART_CENTRE.x * unit,
  SIZE / 2 - ART_CENTRE.y * unit,
  FOREGROUND_ART,
)}</svg>`;

const render = (markup, side) => sharp(Buffer.from(markup), { density: 72 * (side / SIZE) }).resize(side, side);

async function splash(background, file) {
  const tile = await render(svg, SPLASH_TILE).png().toBuffer();
  const offset = Math.round((SPLASH - SPLASH_TILE) / 2);
  await sharp({ create: { width: SPLASH, height: SPLASH, channels: 3, background } })
    .composite([{ input: tile, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
}

mkdirSync(out, { recursive: true });
await render(squareTile, SIZE).removeAlpha().png({ compressionLevel: 9 }).toFile(join(out, "icon-only.png"));
await render(backgroundLayer, SIZE).removeAlpha().png({ compressionLevel: 9 }).toFile(join(out, "icon-background.png"));
await render(foregroundLayer, SIZE).png({ compressionLevel: 9 }).toFile(join(out, "icon-foreground.png"));
await splash(BG_LIGHT, "splash.png");
await splash(BG_DARK, "splash-dark.png");
console.log(`mobile: masters written to ${out}`);

/** Launch logo for iOS (UILaunchScreen in Info.plist): the tile at 150 pt, the size it has in the Capacitor splash. */
async function launchLogo() {
  const dir = join(mobile, "ios/App/App/Assets.xcassets/LaunchLogo.imageset");
  mkdirSync(dir, { recursive: true });
  const images = [];
  for (const scale of [1, 2, 3]) {
    const filename = `launch-logo@${scale}x.png`;
    await render(svg, 150 * scale).png({ compressionLevel: 9 }).toFile(join(dir, filename));
    images.push({ idiom: "universal", filename, scale: `${scale}x` });
  }
  writeFileSync(join(dir, "Contents.json"), `${JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2)}\n`);
}

const run = spawnSync("pnpm", ["exec", "capacitor-assets", "generate", "--ios", "--android", "--assetPath", "assets"], { cwd: mobile, stdio: "inherit" });
if (run.status !== 0) throw new Error(`capacitor-assets failed (exit ${run.status ?? run.signal})`);
await launchLogo();
