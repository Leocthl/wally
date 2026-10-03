// POST /api/see and the photo pick, at the boundary: exactly one of a picture or chips, strict words, the picture's type and
// size read from its bytes, and the same checks for the on-device client (it runs these validators too).
import { MAX_IMAGE_BYTES } from "@wally/agent/vision";
import { describe, expect, it } from "vitest";
import { BoothError } from "../src/booth/backend/errors";
import { MAX_PALETTE_ENTRIES, MAX_SEE_BODY_BYTES, parseAskRequest, parseSeeRequest } from "../src/booth/backend/validate";
import { gifBytes, jpegBase64, jpegBytes, pngBytes, toBase64 } from "./helpers/pictures";

const refused = (run: () => unknown): { status: number; code: string } => {
  try {
    run();
  } catch (err) {
    if (err instanceof BoothError) return { status: err.status, code: err.code };
    throw err;
  }
  throw new Error("expected a refusal");
};

describe("parseSeeRequest: the picture", () => {
  it("accepts a picture and decodes it (type and size from the bytes)", () => {
    const out = parseSeeRequest({ image: { mime: "image/jpeg", data: jpegBase64() } });
    expect(out.image?.mime).toBe("image/jpeg");
    expect(out.image?.bytes).toEqual(jpegBytes());
    expect(out.palette).toEqual([]);
    expect(out.attributes).toBeNull();
  });

  it("accepts a PNG, and a picture with the colour plates", () => {
    const out = parseSeeRequest({ image: { mime: "image/png", data: toBase64(pngBytes()) }, palette: [{ color: "navy", share: 0.6 }] });
    expect(out.image?.mime).toBe("image/png");
    expect(out.palette).toEqual([{ color: "navy", share: 0.6 }]);
  });

  it.each([
    ["a type that is not JPEG, PNG or WebP", { image: { mime: "image/gif", data: jpegBase64() } }, 415, "UNSUPPORTED_MEDIA_TYPE"],
    ["bytes that are not a picture, whatever the claimed type", { image: { mime: "image/jpeg", data: toBase64(gifBytes()) } }, 415, "UNSUPPORTED_MEDIA_TYPE"],
    ["a claimed type that is not the picture's type", { image: { mime: "image/png", data: jpegBase64() } }, 400, "INVALID_FIELD"],
    ["text that is not base64", { image: { mime: "image/jpeg", data: "not base64 at all!" } }, 400, "INVALID_FIELD"],
    ["an empty picture", { image: { mime: "image/jpeg", data: "" } }, 400, "INVALID_FIELD"],
    ["an unknown key inside image", { image: { mime: "image/jpeg", data: jpegBase64(), url: "https://example.com/x.jpg" } }, 400, "UNKNOWN_FIELD"],
    ["a picture that is not an object", { image: "data:image/jpeg;base64,AAAA" }, 400, "INVALID_FIELD"],
    ["a picture with no size", { image: { mime: "image/jpeg", data: toBase64(jpegBytes(0, 0)) } }, 400, "INVALID_FIELD"],
    ["a huge pixel count", { image: { mime: "image/jpeg", data: toBase64(jpegBytes(30_000, 30_000)) } }, 400, "INVALID_FIELD"],
  ])("refuses %s", (_name, body, status, code) => {
    expect(refused(() => parseSeeRequest(body as never))).toEqual({ status, code });
  });

  it("refuses more than 6 MB with 413 before decoding it", () => {
    const tooBig = "A".repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4);
    expect(refused(() => parseSeeRequest({ image: { mime: "image/jpeg", data: tooBig } }))).toEqual({ status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(MAX_SEE_BODY_BYTES).toBeGreaterThan(Math.ceil(MAX_IMAGE_BYTES / 3) * 4);
    expect(MAX_SEE_BODY_BYTES).toBeLessThan(10 * 1024 * 1024);
  });
});

describe("parseSeeRequest: chips and colour plates", () => {
  it("fills what the chips leave out with no preference", () => {
    expect(parseSeeRequest({ attributes: { kind: "hoodie" } }).attributes).toEqual({ kind: "hoodie", colors: [], pattern: null, fit: null, style: [] });
  });

  it("keeps the words the chips set, once each", () => {
    const out = parseSeeRequest({ attributes: { kind: "jacket", colors: ["navy", "navy", "white"], pattern: "check", fit: "relaxed", style: ["streetwear", "cozy"] } });
    expect(out.attributes).toEqual({ kind: "jacket", colors: ["navy", "white"], pattern: "check", fit: "relaxed", style: ["streetwear", "cozy"] });
  });

  it("takes the colour plates alone (the page's palette, no model, no chips yet)", () => {
    const out = parseSeeRequest({ palette: [{ color: "white", share: 0.2 }, { color: "navy", share: 0.7 }, { color: "navy", share: 0.1 }] });
    expect(out.image).toBeNull();
    expect(out.attributes).toBeNull();
    expect(out.palette).toEqual([{ color: "navy", share: 0.7 }, { color: "white", share: 0.2 }]);
  });

  it.each([
    ["nothing at all", {}],
    ["a picture together with chips", { image: { mime: "image/jpeg", data: jpegBase64() }, attributes: { kind: "tee" } }],
    ["an unknown key", { image: { mime: "image/jpeg", data: jpegBase64() }, url: "https://example.com" }],
    ["an unknown kind", { attributes: { kind: "gift_card" } }],
    ["an unknown colour", { attributes: { kind: "tee", colors: ["mauve"] } }],
    ["more than three colours", { attributes: { kind: "tee", colors: ["navy", "white", "red", "black"] } }],
    ["more than two style tags", { attributes: { kind: "tee", style: ["basics", "cozy", "sporty"] } }],
    ["an unknown key inside the chips", { attributes: { kind: "tee", price: 1 } }],
    ["a palette entry with an unknown colour", { palette: [{ color: "mauve", share: 0.5 }] }],
    ["a palette share above 1", { palette: [{ color: "navy", share: 1.5 }] }],
    ["a palette share of 0", { palette: [{ color: "navy", share: 0 }] }],
    ["too many palette entries", { palette: Array.from({ length: MAX_PALETTE_ENTRIES + 1 }, () => ({ color: "navy", share: 0.1 })) }],
    ["a palette that is not a list", { palette: "navy" }],
  ])("refuses %s", (_name, body) => {
    expect(refused(() => parseSeeRequest(body as never)).status).toBe(400);
  });
});

describe("parseAskRequest: a photo pick", () => {
  it("passes a listing id through, with the words the shopper sees", () => {
    expect(parseAskRequest({ requestText: "Navy relaxed hoodie, Demo Outlet", locale: "en", listingId: "lst_photoHoodieNavy" })).toEqual({
      requestText: "Navy relaxed hoodie, Demo Outlet",
      locale: "en",
      listingId: "lst_photoHoodieNavy",
    });
  });

  it("is unchanged for a plain ask", () => {
    expect(parseAskRequest({ requestText: "a cotton tee" })).toEqual({ requestText: "a cotton tee" });
  });

  it.each(["tee", "lst_", "lst_a b c", 42, "lst_" + "x".repeat(41), "../etc/passwd"])("refuses %j as a listing id", (listingId) => {
    expect(refused(() => parseAskRequest({ requestText: "x", listingId } as never)).status).toBe(400);
  });
});
