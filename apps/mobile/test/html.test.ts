// The two changes the build makes to the built index.html: the bridge script before the app, and the viewport.
import { describe, expect, it } from "vitest";
import { BRIDGE_TAG, injectBridge, insetViewport } from "../scripts/html.mjs";

const PAGE = `<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <script type="module" crossorigin src="./assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-abc.css">
  </head>`;

describe("injectBridge", () => {
  it("puts the bridge script right before the app's module script", () => {
    const html = injectBridge(PAGE);
    expect(html.indexOf(BRIDGE_TAG)).toBeGreaterThan(-1);
    expect(html.indexOf(BRIDGE_TAG)).toBeLessThan(html.indexOf("./assets/index-abc.js"));
    expect(html.match(/native-bridge\.js/g)).toHaveLength(1);
  });

  it("is idempotent", () => {
    const once = injectBridge(PAGE);
    expect(injectBridge(once)).toBe(once);
  });

  it("fails loudly when the page has no module script", () => {
    expect(() => injectBridge("<html><head></head></html>")).toThrow(/no module script/);
  });
});

describe("insetViewport", () => {
  it("drops viewport-fit=cover so the shell insets the page", () => {
    const html = insetViewport(PAGE, false);
    expect(html).toContain('content="width=device-width, initial-scale=1.0" />');
    expect(html).not.toContain("viewport-fit");
  });

  it("keeps it for an edge-to-edge build", () => {
    expect(insetViewport(PAGE, true)).toBe(PAGE);
  });

  it("leaves a page without viewport-fit alone", () => {
    const plain = PAGE.replace(", viewport-fit=cover", "");
    expect(insetViewport(plain, false)).toBe(plain);
  });
});
