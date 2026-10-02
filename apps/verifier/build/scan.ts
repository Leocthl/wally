// Network and external-load scan for the built page. The page must open from file:// with no network: any
// match fails the build (build/plugin.ts) and the tests (test/build.test.ts).
export interface ScanRule {
  readonly name: string;
  readonly pattern: RegExp;
}

export const FORBIDDEN: readonly ScanRule[] = [
  { name: "fetch()", pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { name: "WebSocket", pattern: /\bWebSocket\b/ },
  { name: "EventSource", pattern: /\bEventSource\b/ },
  { name: "sendBeacon", pattern: /\bsendBeacon\b/ },
  { name: "importScripts", pattern: /\bimportScripts\b/ },
  { name: "Worker", pattern: /\bnew\s+(Shared)?Worker\s*\(/ },
  { name: "serviceWorker", pattern: /\bserviceWorker\b/ },
  { name: "RTCPeerConnection", pattern: /\bRTCPeerConnection\b/ },
  { name: "WebTransport", pattern: /\bWebTransport\b/ },
  { name: "dynamic import()", pattern: /\bimport\s*\(/ },
  { name: "module script", pattern: /type\s*=\s*["']?module\b/i },
  { name: "<link>", pattern: /<link\b/i },
  { name: "<base>", pattern: /<base\b/i },
  { name: "<form>", pattern: /<form\b/i },
  { name: "<iframe>", pattern: /<i?frame\b/i },
  { name: "<img>", pattern: /<img\b/i },
  { name: "meta refresh", pattern: /http-equiv\s*=\s*["']?refresh/i },
  { name: "external src or href", pattern: /\b(src|href|action)\s*=\s*["']?\s*(https?:|\/\/)/i },
  { name: "CSS @import", pattern: /@import\b/ },
  { name: "CSS url()", pattern: /\burl\s*\(/ },
];

/** Names of the rules the text breaks; empty means clean. */
export function forbiddenApis(text: string): readonly string[] {
  return FORBIDDEN.filter((rule) => rule.pattern.test(text)).map((rule) => rule.name);
}
