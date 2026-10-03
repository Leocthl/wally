// Explicit validators for every request body and path parameter (validate at the boundary, fail closed). The HTTP
// routes run them on parsed JSON bodies; the on-device client runs them on every call from the UI. Unknown keys are
// refused so a typo never turns into a silent default. Deep rule checks happen when the credential is built and
// validated against mandate-credential.schema.json.
import { DEFAULT_PLANNER_CONFIG } from "@wally/agent/planner";
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
} from "../../api/types";
import { badRequest, BoothError } from "./errors";

/** A parsed JSON object (an HTTP body, or the request object the UI passes in). */
export type JsonObject = Readonly<Record<string, unknown>>;

/** mandate.schema.json IntentText maxLength. */
export const MAX_INTENT_CHARS = 280;
/** Longest typed request, measured after NFKC normalisation: the planner's request cap [F56]. */
export const MAX_REQUEST_CHARS = DEFAULT_PLANNER_CONFIG.maxRequestChars;
/** A raw string this long cannot fit the caps once normalised; it is refused before any work is spent on it. */
const RAW_FACTOR = 4;
/** mandate.schema.json Revocation.reason maxLength. */
export const MAX_REVOKE_REASON_CHARS = 200;
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

export function parseSealRequest(body: JsonObject): SealRequest {
  onlyKeys(body, ["intentText", "rules", "validUntil", "family"]);
  const intentText = text(body, "intentText", 1, MAX_INTENT_CHARS);
  const rules = body["rules"];
  if (rules === null || typeof rules !== "object" || Array.isArray(rules)) throw badRequest("INVALID_FIELD", "rules must be an object");
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

/** requestText comes back NFKC-normalised, as the planners read it. */
export function parseAskRequest(body: JsonObject): AskRequest {
  onlyKeys(body, ["requestText", "locale"]);
  const requestText = sentence(body, "requestText", MAX_REQUEST_CHARS);
  const chosen = locale(body, false);
  return { requestText, ...(chosen === undefined ? {} : { locale: chosen }) };
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
