// Loopback guards. The API binds 127.0.0.1 only; these checks stop a web page in the judge's browser from driving it
// (DNS rebinding sends a foreign Host; a cross-site fetch or form sends a foreign Origin or Sec-Fetch-Site).

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostnameOf(authority: string): string | null {
  try {
    return new URL(`http://${authority}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const isLoopbackHostname = (hostname: string): boolean => LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());

/** Host header (authority) names an allowed host (default: loopback), any port. */
export function isAllowedHost(host: string | undefined | null, allowed: (hostname: string) => boolean = isLoopbackHostname): boolean {
  if (host === undefined || host === null || host === "" || /[\s/@]/.test(host)) return false;
  const name = hostnameOf(host);
  return name !== null && allowed(name);
}

/** Origin header is an http(s) loopback origin. "null" (sandboxed frames, file://) is refused. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase()) && url.origin === origin;
  } catch {
    return false;
  }
}

export type OriginVerdict = "ok" | "foreign_origin" | "cross_site";

/**
 * POST requests: an Origin, when present, must be loopback; Sec-Fetch-Site, when present, must not be cross-site.
 * No Origin at all is allowed: command-line clients (scripts/demo-reset.mjs, curl) send none, and a browser page
 * cannot send a cross-origin JSON POST without one.
 */
export function checkPostOrigin(origin: string | undefined, fetchSite: string | undefined): OriginVerdict {
  if (fetchSite !== undefined && fetchSite.toLowerCase() === "cross-site") return "cross_site";
  if (origin === undefined) return "ok";
  return isLoopbackOrigin(origin) ? "ok" : "foreign_origin";
}

/** application/json, optionally with parameters (charset). */
export function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  const [type] = value.split(";");
  return type?.trim().toLowerCase() === "application/json";
}
