// Explicit validators for every request body and path parameter (validate at the boundary, fail closed). The HTTP
// routes run them on parsed JSON bodies; the on-device client runs them on every call from the UI. Unknown keys are
// refused so a typo never turns into a silent default. Deep rule checks happen when the credential is built and
// validated against mandate-credential.schema.json.
import { DEFAULT_COMPILER_LIMITS } from "@wally/agent/compiler";
import { DEFAULT_PLANNER_CONFIG } from "@wally/agent/planner";
import { checkImage, fromBase64, isColor, isFit, isKind, isPattern, isStyle, MAX_COLORS, MAX_IMAGE_BYTES, MAX_LIMIT_DOLLARS, MAX_STYLES, type Color, type Fit, type ImageMime, type PaletteEntry, type Style } from "@wally/agent/vision";
import type { CompiledRules } from "@wally/core/generated";
import {
  SCENARIO_IDS,
  type AlternativesRequest,
  type AskLocale,
  type AskRequest,
  type CompileRulesRequest,
  type EscalationAnswerRequest,
  type FamilySeal,
  type ProposeRequest,
  type ScenarioId,
  type SealRequest,
  type SeeAttributes,
} from "../../api/types";
import { badRequest, BoothError } from "./errors";

/** A parsed JSON object (an HTTP body, or the request object the UI passes in). */
export type JsonObject = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);

/** mandate.schema.json IntentText maxLength. */
export const MAX_INTENT_CHARS = 280;
/** Longest typed request, measured after NFKC normalisation: the planner's request cap [F56]. */
export const MAX_REQUEST_CHARS = DEFAULT_PLANNER_CONFIG.maxRequestChars;
/** A raw string this long cannot fit the caps once normalised; it is refused before any work is spent on it. */
const RAW_FACTOR = 4;
/** mandate.schema.json Revocation.reason maxLength. */
export const MAX_REVOKE_REASON_CHARS = 200;
/** The most a budget may be, in minor units: the compiler's ceiling [F1], the figure the first run caps a typed amount to. A seal above it is a typo or an attack, not a budget. */
export const MAX_SEAL_BUDGET_MINOR = DEFAULT_COMPILER_LIMITS.ceilingMinor;
/** mandate.schema.json DecisionId. */
const DECISION_ID_RE = /^dec_[A-Za-z0-9]{6,40}$/;
/** RFC 3339 UTC with a Z suffix and optional fraction (mandate.schema.json Timestamp). */
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

function onlyKeys(body: JsonObject, allowed: readonly string[]): void {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k));
  if (extra.length > 0) throw badRequest("UNKNOWN_FIELD", `unknown field(s): ${extra.slice(0, 5).join(", ")}`);
}

function text(body: JsonObject, key: string, min: number, max: number): string {
  const value = body[key];
  if (typeof value !== "string") throw badRequest("INVALID_FIELD", `${key} must be a string`);
  if (value.trim().length < min) throw badRequest("INVALID_FIELD", `${key} must not be empty`);
  if (value.length > max) throw badRequest("TEXT_TOO_LONG", `${key} is longer than ${max} characters`);
  return value;
}

/** { parent: "mum" } or nothing; any other shape is refused (a typo never turns into a plain budget). */
function parseFamily(value: unknown): FamilySeal | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw badRequest("INVALID_FIELD", "family must be an object");
  onlyKeys(value as JsonObject, ["parent"]);
  if ((value as JsonObject)["parent"] !== "mum") throw badRequest("INVALID_FIELD", "family.parent must be mum");
  return { parent: "mum" };
}

/** A budget object with an amount outside 1..MAX_SEAL_BUDGET_MINOR (or not a whole number) is refused here; one with no budget object is left to the credential's schema check. */
function checkBudgetAmount(rules: object): void {
  const budget = (rules as JsonObject)["budget"];
  if (!isObject(budget)) return;
  const amount = budget["amount_minor"];
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_SEAL_BUDGET_MINOR) {
    throw badRequest("INVALID_FIELD", `rules.budget.amount_minor must be a whole number of minor units from 1 to ${MAX_SEAL_BUDGET_MINOR}`);
  }
}

export function parseSealRequest(body: JsonObject): SealRequest {
  onlyKeys(body, ["intentText", "rules", "validUntil", "family"]);
  const intentText = text(body, "intentText", 1, MAX_INTENT_CHARS);
  const rules = body["rules"];
  if (rules === null || typeof rules !== "object" || Array.isArray(rules)) throw badRequest("INVALID_FIELD", "rules must be an object");
  checkBudgetAmount(rules);
  const validUntil = text(body, "validUntil", 1, 40);
  if (!TIMESTAMP_RE.test(validUntil) || Number.isNaN(Date.parse(validUntil))) throw badRequest("INVALID_FIELD", "validUntil must be RFC 3339 UTC");
  const family = parseFamily(body["family"]);
  // rules is checked field by field when the credential is validated against its schema; here it is only an object.
  return { intentText, rules: rules as CompiledRules, validUntil, ...(family === undefined ? {} : { family }) };
}

export function parseProposeRequest(body: JsonObject, maxListingChars: number): ProposeRequest {
  onlyKeys(body, ["listingText"]);
  return { listingText: text(body, "listingText", 1, maxListingChars) };
}

/** NFKC, one space between words, trimmed: the form every caller (planner, compiler, recorded lookup) reads. */
export const normaliseText = (value: string): string => value.normalize("NFKC").replace(/\s+/gu, " ").trim();

function sentence(body: JsonObject, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== "string") throw badRequest("INVALID_FIELD", `${key} must be a string`);
  if (value.length > max * RAW_FACTOR) throw badRequest("TEXT_TOO_LONG", `${key} is longer than ${max} characters`);
  const normalised = normaliseText(value);
  if (normalised === "") throw badRequest("INVALID_FIELD", `${key} must not be empty`);
  if (normalised.length > max) throw badRequest("TEXT_TOO_LONG", `${key} is longer than ${max} characters`);
  return normalised;
}

function locale(body: JsonObject, required: boolean): AskLocale | undefined {
  const value = body["locale"];
  if (value === undefined && !required) return undefined;
  if (value !== "en" && value !== "zh-HK") throw badRequest("INVALID_FIELD", "locale must be en or zh-HK");
  return value;
}

/** mandate.schema.json ListingId. */
const LISTING_ID_RE = /^lst_[A-Za-z0-9]{3,40}$/;

/** requestText comes back NFKC-normalised, as the planners read it. `listingId` is a photo pick (a listing id, checked by the backend). */
export function parseAskRequest(body: JsonObject): AskRequest {
  onlyKeys(body, ["requestText", "locale", "listingId"]);
  const requestText = sentence(body, "requestText", MAX_REQUEST_CHARS);
  const chosen = locale(body, false);
  const listingId = body["listingId"];
  if (listingId !== undefined && (typeof listingId !== "string" || !LISTING_ID_RE.test(listingId))) throw badRequest("INVALID_FIELD", "listingId is not a listing id");
  return { requestText, ...(chosen === undefined ? {} : { locale: chosen }), ...(typeof listingId === "string" ? { listingId } : {}) };
}

// ---------- Show Wally a photo (POST /api/see) ----------

/** The most colour entries the page sends: its palette keeps four [F105]. */
export const MAX_PALETTE_ENTRIES = 6;
/** JPEG only: the page always sends one (see vision/image.ts for why PNG and WebP are refused) [F105]. */
const IMAGE_MIMES: readonly ImageMime[] = ["image/jpeg"];
/** base64 of the largest accepted picture. */
const MAX_IMAGE_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
/** The body cap of POST /api/see: the base64 picture plus a little for the rest of the object [F105]. Every other route keeps F64's 128 KiB. */
export const MAX_SEE_BODY_BYTES = MAX_IMAGE_BASE64_CHARS + 16 * 1024;

/** A request to see(), checked: a decoded picture (or none), the page's colour plates and the shopper's chips. */
export interface SeeInput {
  readonly image: { readonly bytes: Uint8Array; readonly mime: ImageMime } | null;
  readonly palette: readonly PaletteEntry[];
  readonly attributes: SeeAttributes | null;
  /** The shopper's own words, NFKC-normalised; null when a picture or chips came. */
  readonly text: string | null;
  /** The price limit the chips carry (integer minor units); null: none. */
  readonly maxPriceMinor: number | null;
}

/** The most a price limit may be, in minor units: HK$99,999 [F105], the same bound the words are read with. */
const MAX_LIMIT_MINOR = MAX_LIMIT_DOLLARS * 100;

function parseImage(value: unknown): NonNullable<SeeInput["image"]> {
  if (!isObject(value)) throw badRequest("INVALID_FIELD", "image must be an object");
  onlyKeys(value, ["mime", "data"]);
  const mime = IMAGE_MIMES.find((m) => m === value["mime"]);
  if (mime === undefined) throw new BoothError(415, "UNSUPPORTED_MEDIA_TYPE", "the picture must be a JPEG");
  const data = value["data"];
  if (typeof data !== "string" || data.length === 0) throw badRequest("INVALID_FIELD", "image.data must be a base64 string");
  if (data.length > MAX_IMAGE_BASE64_CHARS) throw new BoothError(413, "PAYLOAD_TOO_LARGE", `the picture is larger than ${MAX_IMAGE_BYTES} bytes`);
  const bytes = fromBase64(data);
  if (bytes === null) throw badRequest("INVALID_FIELD", "image.data is not base64");
  const checked = checkImage(bytes);
  if (!checked.ok) {
    // The length check above already bounds the decoded size, so a picture over the byte cap cannot get here.
    if (checked.reason === "unsupported_type") throw new BoothError(415, "UNSUPPORTED_MEDIA_TYPE", "the picture must be a JPEG");
    throw badRequest("INVALID_FIELD", checked.reason === "empty" ? "the picture is empty" : "the picture has no usable size");
  }
  if (checked.info.mime !== mime) throw badRequest("INVALID_FIELD", "image.mime does not match the picture");
  return { bytes, mime };
}

function parsePalette(value: unknown): readonly PaletteEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PALETTE_ENTRIES) throw badRequest("INVALID_FIELD", `palette must be a list of at most ${MAX_PALETTE_ENTRIES} colours`);
  const entries = value.map((entry): PaletteEntry => {
    if (!isObject(entry)) throw badRequest("INVALID_FIELD", "palette entries must be objects");
    onlyKeys(entry, ["color", "share"]);
    const color = entry["color"];
    const share = entry["share"];
    if (!isColor(color)) throw badRequest("INVALID_FIELD", "palette.color is not a known colour");
    if (typeof share !== "number" || !Number.isFinite(share) || share <= 0 || share > 1) throw badRequest("INVALID_FIELD", "palette.share must be above 0 and at most 1");
    return { color, share: Math.round(share * 1000) / 1000 };
  });
  return entries.filter((e, i) => entries.findIndex((o) => o.color === e.color) === i).sort((a, b) => b.share - a.share);
}

function knownWords<T extends string>(value: unknown, key: string, known: (v: unknown) => v is T, max: number): readonly T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || !value.every(known)) throw badRequest("INVALID_FIELD", `${key} must be at most ${max} known words`);
  return value.filter((w, i) => value.indexOf(w) === i);
}

function oneWord<T extends string>(value: unknown, key: string, known: (v: unknown) => v is T): T | null {
  if (value === undefined || value === null) return null;
  if (!known(value)) throw badRequest("INVALID_FIELD", `${key} is not a known word`);
  return value;
}

/** "unknown" is how the model says it cannot tell; for the shopper's chips it is the same as no choice. */
const noPreference = (fit: Fit | null): Exclude<Fit, "unknown"> | null => (fit === "unknown" ? null : fit);

function parseSeeAttributes(value: unknown): SeeAttributes {
  if (!isObject(value)) throw badRequest("INVALID_FIELD", "attributes must be an object");
  onlyKeys(value, ["kind", "colors", "pattern", "fit", "style"]);
  return {
    kind: oneWord(value["kind"], "kind", isKind),
    colors: knownWords<Color>(value["colors"], "colors", isColor, MAX_COLORS),
    pattern: oneWord(value["pattern"], "pattern", isPattern),
    fit: noPreference(oneWord(value["fit"], "fit", isFit)),
    style: knownWords<Style>(value["style"], "style", isStyle, MAX_STYLES),
  };
}

function parseLimit(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT_MINOR) throw badRequest("INVALID_FIELD", `maxPriceMinor must be a whole number of minor units from 1 to ${MAX_LIMIT_MINOR}`);
  return value;
}

/**
 * Exactly one of a picture, chips or the shopper's words, plus the colour plates when the page has them (with a picture or
 * chips) and the price limit the chips carry. Unknown keys and words are refused.
 */
export function parseSeeRequest(body: JsonObject): SeeInput {
  onlyKeys(body, ["image", "palette", "attributes", "text", "maxPriceMinor"]);
  const hasImage = body["image"] !== undefined;
  const hasAttributes = body["attributes"] !== undefined;
  const hasText = body["text"] !== undefined;
  if (Number(hasImage) + Number(hasAttributes) + Number(hasText) > 1) throw badRequest("INVALID_FIELD", "send one of image, attributes or text");
  if (!hasImage && !hasAttributes && !hasText && body["palette"] === undefined) throw badRequest("INVALID_FIELD", "send an image, a palette, attributes or text");
  if (hasText && body["palette"] !== undefined) throw badRequest("INVALID_FIELD", "text does not come with a palette");
  if (body["maxPriceMinor"] !== undefined && !hasAttributes) throw badRequest("INVALID_FIELD", "maxPriceMinor goes with attributes");
  // The small fields first: a bad word is refused before the picture is decoded.
  const palette = parsePalette(body["palette"]);
  const attributes = hasAttributes ? parseSeeAttributes(body["attributes"]) : null;
  const maxPriceMinor = parseLimit(body["maxPriceMinor"]);
  const text = hasText ? sentence(body, "text", MAX_REQUEST_CHARS) : null;
  return { image: hasImage ? parseImage(body["image"]) : null, palette, attributes, text, maxPriceMinor };
}

export function parseAlternativesRequest(body: JsonObject): AlternativesRequest {
  onlyKeys(body, ["decisionId"]);
  const decisionId = text(body, "decisionId", 1, 60);
  if (!DECISION_ID_RE.test(decisionId)) throw badRequest("INVALID_FIELD", "decisionId is not a decision id");
  return { decisionId };
}

/** The sentence is capped like the mandate's intent text, after NFKC. */
export function parseCompileRequest(body: JsonObject): CompileRulesRequest {
  onlyKeys(body, ["text", "locale"]);
  const sentenceText = sentence(body, "text", MAX_INTENT_CHARS);
  return { text: sentenceText, locale: locale(body, true) ?? "en" };
}

export function parseRevokeRequest(body: JsonObject): { readonly reason?: string } {
  onlyKeys(body, ["reason"]);
  if (body["reason"] === undefined) return {};
  return { reason: text(body, "reason", 1, MAX_REVOKE_REASON_CHARS) };
}

export function parseAnswerRequest(body: JsonObject): EscalationAnswerRequest {
  onlyKeys(body, ["decisionId", "choice"]);
  const decisionId = text(body, "decisionId", 1, 60);
  if (!DECISION_ID_RE.test(decisionId)) throw badRequest("INVALID_FIELD", "decisionId is not a decision id");
  const choice = body["choice"];
  if (choice !== "APPROVE" && choice !== "DENY") throw badRequest("INVALID_FIELD", "choice must be APPROVE or DENY");
  return { decisionId, choice };
}

export function parseEmptyBody(body: JsonObject): void {
  onlyKeys(body, []);
}

export function parseScenarioId(raw: string): ScenarioId {
  const found = SCENARIO_IDS.find((id) => id === raw);
  if (found === undefined) throw new BoothError(404, "UNKNOWN_SCENARIO", "no such booth scenario");
  return found;
}
