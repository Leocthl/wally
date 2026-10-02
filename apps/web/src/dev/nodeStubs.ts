// Dev server only: the on-device bundle reaches node:fs, node:path and node:url through the replay stores. The production
// build shims them (they are never called in the browser); the dev server instead throws on the first property access, which
// blanks every page that loads the on-device or mock client (?api=local, ?api=mock, the variant picker). These stand-ins
// keep the import alive and throw only if something really calls them. Wired in vite.config.ts with apply: "serve".
import type { Plugin } from "vite";

const NO = 'const no = () => { throw new Error("a node: module was called in the browser"); };';

const SOURCES: Readonly<Record<string, string>> = {
  "node:fs": `${NO} export const readFileSync = no, readdirSync = no, existsSync = no, writeFileSync = no, mkdirSync = no, statSync = no; export default { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, statSync };`,
  "node:path": "export const join = (...p) => p.join('/'), resolve = (...p) => p.join('/'), basename = (p) => String(p).split('/').pop(), relative = (_a, b) => b, dirname = (p) => String(p).split('/').slice(0, -1).join('/'); export default { join, resolve, basename, relative, dirname };",
  "node:url": "export const fileURLToPath = (u) => String(u); export default { fileURLToPath };",
};

const PREFIX = "\0wally-node-stub:";

export function devNodeStubs(): Plugin {
  return {
    name: "wally-dev-node-stubs",
    apply: "serve",
    enforce: "pre",
    resolveId: (id) => (id in SOURCES ? `${PREFIX}${id}` : null),
    load: (id) => (id.startsWith(PREFIX) ? (SOURCES[id.slice(PREFIX.length)] ?? null) : null),
  };
}
