// The GitHub Pages build of the on-device app: `pnpm pages:build` from the repo root runs this config (and then adds the
// offline verifier). The same app as the booth build, but forced on-device (no booth server exists on a static host, so
// the page never probes /api), written to dist-pages so the booth's dist is never touched, and run through the Pages
// rules (build/pagesPlugin.ts) so every URL still works when the site is served from /<repo>/ instead of the origin root.
import { mergeConfig } from "vite";
import base from "./vite.config";
import { wallyPages } from "./build/pagesPlugin";

if (process.env["VITE_API"] !== "local") throw new Error("vite.pages.config.ts builds the on-device app: set VITE_API=local, or run pnpm pages:build from the repo root");

export default mergeConfig(base, {
  plugins: [wallyPages()],
  build: { outDir: "dist-pages", emptyOutDir: true },
});
