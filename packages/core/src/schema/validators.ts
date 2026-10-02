// Boundary validators for schemas/ (draft 2020-12, ajv strict mode), compiled AHEAD OF TIME by scripts/gen-types.mjs
// (ajv standalone) into ./compiled/validators.ts: nothing is compiled with new Function at run time, so a page with a
// strict Content-Security-Policy (no 'unsafe-eval') can run them. A test compiles the same schemas with ajv at run
// time and checks every verdict and error list agree. Every validateX returns a typed result and never throws on bad input.
import type { ErrorObject } from "ajv";
import * as compiled from "./compiled/validators";
import type {
  CardEvent,
  CardRecord,
  Cart,
  Decision,
  EscalationAnswer,
  JudgeRecord,
  ListingRecord,
  LogEntry,
  Mandate,
  MandateCredential,
  PacketState,
  PlannerReplayRecord,
  ProposeCartInput,
  Revocation,
  ScameterCapture,
} from "../generated";

export const SCHEMA_ID_BASE = "https://laisee.local/schemas/";

export interface ValidationIssue {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationIssue[] };

export type Validator<T> = (data: unknown) => ValidationResult<T>;

/** A compiled ajv validator: true or false, with the errors of the last call on the function (ajv's contract). */
type CompiledValidate = ((data: unknown) => boolean) & { readonly errors?: readonly ErrorObject[] | null };

function toIssue(e: ErrorObject): ValidationIssue {
  return { path: e.instancePath || "/", keyword: e.keyword, message: e.message ?? "invalid" };
}

function makeValidator<T>(fn: CompiledValidate): Validator<T> {
  return (data: unknown) => (fn(data) ? { ok: true, value: data as T } : { ok: false, errors: (fn.errors ?? []).map(toIssue) });
}

// The generated module is untyped (@ts-nocheck); each export is an ajv standalone validate function.
const v = compiled as unknown as Readonly<Record<keyof typeof compiled, CompiledValidate>>;

export const validateMandate = makeValidator<Mandate>(v.validateMandate);
export const validateMandateCredential = makeValidator<MandateCredential>(v.validateMandateCredential);
export const validateCart = makeValidator<Cart>(v.validateCart);
export const validateDecision = makeValidator<Decision>(v.validateDecision);
export const validateLogEntry = makeValidator<LogEntry>(v.validateLogEntry);
export const validateCardRecord = makeValidator<CardRecord>(v.validateCardRecord);
export const validatePacketState = makeValidator<PacketState>(v.validatePacketState);
export const validateListingRecord = makeValidator<ListingRecord>(v.validateListingRecord);
export const validateScameterCapture = makeValidator<ScameterCapture>(v.validateScameterCapture);
export const validateProposeCartInput = makeValidator<ProposeCartInput>(v.validateProposeCartInput);
export const validatePlannerReplayRecord = makeValidator<PlannerReplayRecord>(v.validatePlannerReplayRecord);
export const validateJudgeRecord = makeValidator<JudgeRecord>(v.validateJudgeRecord);
export const validateEscalationAnswer = makeValidator<EscalationAnswer>(v.validateEscalationAnswer);
export const validateCardEvent = makeValidator<CardEvent>(v.validateCardEvent);
export const validateRevocation = makeValidator<Revocation>(v.validateRevocation);

/** Validators by short name; fixture envelopes name their schema with these keys. */
export const VALIDATORS = {
  "mandate": validateMandate,
  "mandate-credential": validateMandateCredential,
  "cart": validateCart,
  "decision": validateDecision,
  "log-entry": validateLogEntry,
  "card-record": validateCardRecord,
  "packet-state": validatePacketState,
  "listing-record": validateListingRecord,
  "scameter-capture": validateScameterCapture,
  "propose-cart": validateProposeCartInput,
  "planner-replay": validatePlannerReplayRecord,
  "judge-record": validateJudgeRecord,
  "escalation-answer": validateEscalationAnswer,
  "card-event": validateCardEvent,
  "revocation": validateRevocation,
} as const;

export type SchemaName = keyof typeof VALIDATORS;

/** Data type per schema name, e.g. SchemaTypes["cart"] = Cart. */
export type SchemaTypes = { [K in SchemaName]: (typeof VALIDATORS)[K] extends Validator<infer T> ? T : never };

export function isSchemaName(name: string): name is SchemaName {
  return Object.hasOwn(VALIDATORS, name);
}

/** Validates against a schema by short name; unknown names fail closed. */
export function validateBySchemaName(name: string, data: unknown): ValidationResult<unknown> {
  if (!isSchemaName(name)) {
    return { ok: false, errors: [{ path: "/", keyword: "schema", message: `unknown schema name ${name}` }] };
  }
  return VALIDATORS[name](data);
}

/** One line per issue, for logs and error messages. */
export function formatIssues(errors: readonly ValidationIssue[]): string {
  return errors.map((e) => `${e.path} ${e.message} (${e.keyword})`).join("; ");
}
