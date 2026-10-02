// Pure changes to the built index.html for the native shells (unit-tested in test/html.test.ts).

export const BRIDGE_TAG = '<script type="module" src="./native-bridge.js"></script>';

/** Puts the bridge before the app's first module script, so the plugins exist when the app boots. */
export function injectBridge(html) {
  if (html.includes(BRIDGE_TAG)) return html;
  const at = html.search(/<script\b[^>]*\btype="module"/);
  if (at < 0) throw new Error("index.html has no module script; the web build changed shape");
  return `${html.slice(0, at)}${BRIDGE_TAG}\n    ${html.slice(at)}`;
}

/**
 * The shell insets the page below the status bar and above the home indicator, so the page must not ask for
 * viewport-fit=cover. With edgeToEdge the page keeps it and pads itself with env(safe-area-inset-*).
 */
export function insetViewport(html, edgeToEdge) {
  return edgeToEdge ? html : html.replace(/,\s*viewport-fit=cover/, "");
}
