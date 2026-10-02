// Regenerates src/design/tokens-fallback.css from tokens.css. Run: pnpm --filter @laisee/web exec tsx scripts/gen-token-fallback.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFallbackCss } from "../src/design/tokenTools";

const DESIGN = resolve(dirname(fileURLToPath(import.meta.url)), "../src/design");
const css = readFileSync(resolve(DESIGN, "tokens.css"), "utf8");
const warm = readFileSync(resolve(DESIGN, "tokens-warm.css"), "utf8");
writeFileSync(resolve(DESIGN, "tokens-fallback.css"), buildFallbackCss(css, warm));
process.stdout.write("tokens-fallback.css written\n");
