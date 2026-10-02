// What GET /api/lan answers on the booth Mac in LAN mode (server/http/lan.ts), and the reader for it. The route answers
// only to a page on the Mac itself (loopback Host and socket); anywhere else it is a plain 404, so "no LAN panel"
// is the normal case and never an error. Everything is validated: the page shows nothing it did not check.

export interface LanInfo {
  readonly lan: true;
  /** The pairing token of this server start (128 random bits, hex). */
  readonly token: string;
  /** Pairing links, the token included; the first one is the address of the Mac on the Wi-Fi. */
  readonly urls: readonly string[];
  /** One inline SVG QR code per link, same order as `urls`. */
  readonly qrSvg: readonly string[];
}

/** ASSUMED: how long the booth Mac's own page waits for /api/lan before it shows no QR panel. */
const LAN_ASK_TIMEOUT_MS = 3_000;

const isStringArray = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((v) => typeof v === "string");

/** The checked LanInfo, or null for anything else (a 404 body, the dev server's HTML, an odd shape). */
export function parseLanInfo(value: unknown): LanInfo | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v["lan"] !== true || typeof v["token"] !== "string" || !isStringArray(v["urls"]) || !isStringArray(v["qrSvg"])) return null;
  const urls = v["urls"];
  const qrSvg = v["qrSvg"];
  if (urls.length !== qrSvg.length || !qrSvg.every((svg) => svg.trimStart().startsWith("<svg"))) return null;
  return { lan: true, token: v["token"], urls, qrSvg };
}

/** GET /api/lan on this origin. Null when LAN mode is off, this page is not on the Mac, or the answer is not LanInfo. */
export async function fetchLanInfo(fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)): Promise<LanInfo | null> {
  try {
    const res = await fetcher("/api/lan", { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(LAN_ASK_TIMEOUT_MS) });
    return res.ok ? parseLanInfo((await res.json()) as unknown) : null;
  } catch {
    return null;
  }
}

/** An SVG string as an image source. An <img> never runs script, so a bad answer cannot do more than draw. */
export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
