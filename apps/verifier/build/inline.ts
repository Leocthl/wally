// Inline one classic script and one stylesheet into the page template, with a CSP that forbids every network
// fetch. Pure string work plus SHA-256 (node:crypto, build time only; never in the page bundle).
import { createHash } from "node:crypto";

/** ajv (inside @laisee/core/verify) compiles its validators with new Function at load, hence 'unsafe-eval'. */
const SCRIPT_EVAL = "'unsafe-eval'";

export function sha256Base64(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

/** Make JS safe inside <script>: no `</script` and no `<!--` (HTML script-data states). Throws if it cannot. */
export function escapeInlineScript(code: string): string {
  const escaped = code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "\\x3C!--");
  if (/<\/script/i.test(escaped) || escaped.includes("<!--")) throw new Error("script still holds </script or <!--");
  return escaped;
}

export function assertInlineStyle(css: string): string {
  if (/<\/style/i.test(css)) throw new Error("stylesheet holds </style");
  return css;
}

/** default-src 'none' blocks fetch, XHR, WebSocket, images, fonts, frames and form posts; only the hashed inline code runs. */
export function contentSecurityPolicy(script: string, style: string): string {
  return [
    "default-src 'none'",
    `script-src 'sha256-${sha256Base64(script)}' ${SCRIPT_EVAL}`,
    `style-src 'sha256-${sha256Base64(style)}'`,
    "connect-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

export interface InlineInput {
  readonly template: string;
  /** The dev-server script tag in the template that the inline script replaces. */
  readonly scriptTag: string;
  readonly js: string;
  readonly css: string;
}

function replaceOnce(text: string, find: string, replacement: string): string {
  const at = text.indexOf(find);
  if (at < 0 || text.indexOf(find, at + 1) >= 0) throw new Error(`template must hold exactly one ${find}`);
  return `${text.slice(0, at)}${replacement}${text.slice(at + find.length)}`;
}

/** The single self-contained page: CSP meta first in <head>, then the style, the classic script in place of the module tag. */
export function inlinePage({ template, scriptTag, js, css }: InlineInput): string {
  const script = escapeInlineScript(js);
  const style = assertInlineStyle(css);
  const csp = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(script, style)}" />`;
  const withHead = replaceOnce(template, '<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${csp}`);
  const withStyle = replaceOnce(withHead, "</head>", `<style>${style}</style>\n  </head>`);
  return replaceOnce(withStyle, scriptTag, `<script>${script}</script>`);
}
