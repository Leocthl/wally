// Rules of the GitHub Pages build, pure so the tests can prove them. A project site is served from /<repo>/, not from the
// origin root, so a URL that starts with a single slash leaves the app (it asks github.io, not the project). The app is
// built with relative URLs; these rules cover what is still written the other way:
//  - the Proof screen links to the offline verifier as "/verifier/" (the booth server mounts at the root);
//  - the manifest id "./" is read against the origin, so it names the origin root, shared by every project site there;
//  - findRootAbsolute names whatever else could slip in later, so the build fails instead of shipping a dead link.

/** Names under the app root that the build writes; a literal that starts with one of them after a single slash is a dead link under a mount. /api is deliberately absent: the on-device build never calls it (the e2e proves it). */
const APP_PATHS = ["verifier", "icons", "assets", "manifest\\.webmanifest", "sw\\.js", "offline\\.html", "index\\.html", "favicon\\.svg", "mask-icon\\.svg"] as const;

const VERIFIER_LITERAL = /(["'`])\/verifier\/\1/g;
const HTML_LINK = /\b(?:href|src|action|poster)\s*=\s*(["'])\/(?!\/)[^"']*\1/g;
const CSS_URL = /url\(\s*["']?\/(?!\/)/g;
const MANIFEST_URL = /"(?:start_url|scope|id|src|url)"\s*:\s*"\/(?!\/)[^"]*"/g;
const SCRIPT_PATH = new RegExp(`(["'\`])/(?:${APP_PATHS.join("|")})(?:[/?#][^"'\`\\n]*)?\\1`, "g");

const RULES: Readonly<Record<string, RegExp>> = {
  ".html": HTML_LINK,
  ".svg": HTML_LINK,
  ".css": CSS_URL,
  ".webmanifest": MANIFEST_URL,
  ".json": MANIFEST_URL,
  ".js": SCRIPT_PATH,
  ".mjs": SCRIPT_PATH,
};

export interface Finding {
  readonly file: string;
  /** 1-based line of the match (minified scripts are one long line). */
  readonly line: number;
  readonly text: string;
}

const extensionOf = (file: string): string => {
  const dot = file.lastIndexOf(".");
  return dot < 0 ? "" : file.slice(dot).toLowerCase();
};

/** True for the file types findRootAbsolute reads; the rest (images) are skipped without being read. */
export function isScanned(file: string): boolean {
  return Object.hasOwn(RULES, extensionOf(file));
}

/** "/verifier/" to "./verifier/" in every quoted literal. Relative to the page, which is the mount root: hash routes never change the path. */
export function relativeVerifierLinks(code: string): string {
  return code.replace(VERIFIER_LITERAL, "$1./verifier/$1");
}

export function findRootAbsolute(file: string, text: string): readonly Finding[] {
  const rule = Object.hasOwn(RULES, extensionOf(file)) ? RULES[extensionOf(file)] : undefined;
  if (rule === undefined) return [];
  return [...text.matchAll(rule)].map((m) => ({ file, line: text.slice(0, m.index).split("\n").length, text: m[0] }));
}

/** The manifest without its id: the identity then falls back to start_url, which sits inside the mount. */
export function relativeManifest(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error("pages: the manifest is not valid JSON", { cause });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("pages: the manifest is not a JSON object");
  const { id: _id, ...rest } = parsed as Record<string, unknown>;
  return `${JSON.stringify(rest, null, 2)}\n`;
}
