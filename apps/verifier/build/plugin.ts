// Vite plugin (build only): turn the library-mode IIFE chunk and its CSS into ONE dist/index.html, then refuse
// the build if the page could reach the network (build/scan.ts). Nothing else is left in dist/.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { inlinePage } from "./inline";
import { forbiddenApis } from "./scan";

export interface SingleFileOptions {
  /** Page template, relative to the Vite root. */
  readonly template: string;
  /** The template's dev-server script tag, replaced by the inline classic script. */
  readonly scriptTag: string;
}

type Bundle = Parameters<NonNullable<Extract<Plugin["generateBundle"], (...args: never[]) => unknown>>>[1];

function pickOutputs(bundle: Bundle): { readonly js: string; readonly css: string } {
  const files = Object.values(bundle);
  const chunks = files.flatMap((f) => (f.type === "chunk" && f.isEntry ? [f.code] : []));
  const styles = files.flatMap((f) => (f.type === "asset" && f.fileName.endsWith(".css") ? [String(f.source)] : []));
  if (chunks.length !== 1) throw new Error(`expected one entry chunk, got ${chunks.length}`);
  return { js: chunks[0] ?? "", css: styles.join("\n") };
}

export function singleFilePage(options: SingleFileOptions): Plugin {
  let root = process.cwd();
  return {
    name: "laisee-single-file-page",
    apply: "build",
    // After vite:css-post, which adds the extracted stylesheet to the bundle in its own generateBundle.
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_outputOptions, bundle) {
      const { js, css } = pickOutputs(bundle);
      const template = readFileSync(resolve(root, options.template), "utf8");
      const html = inlinePage({ template, scriptTag: options.scriptTag, js, css });
      const hits = forbiddenApis(html);
      if (hits.length > 0) this.error(`built page may reach the network: ${hits.join(", ")}`);
      // Rollup's API: generated files are removed from the bundle object itself.
      for (const fileName of Object.keys(bundle)) delete bundle[fileName];
      this.emitFile({ type: "asset", fileName: "index.html", source: html });
    },
  };
}
