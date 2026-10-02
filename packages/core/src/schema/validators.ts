// Boundary validators compiled from schemas/ (draft 2020-12) with ajv in strict mode.
// Every validateX returns a typed result and never throws on bad input.
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import cardRecordSchema from "../../../../schemas/card-record.schema.json" with { type: "json" };
import cartSchema from "../../../../schemas/cart.schema.json" with { type: "json" };
import decisionSchema from "../../../../schemas/decision.schema.json" with { type: "json" };
import listingRecordSchema from "../../../../schemas/listing-record.schema.json" with { type: "json" };
import logEntrySchema from "../../../../schemas/log-entry.schema.json" with { type: "json" };
import mandateCredentialSchema from "../../../../schemas/mandate-credential.schema.json" with { type: "json" };
import mandateSchema from "../../../../schemas/mandate.schema.json" with { type: "json" };
import packetStateSchema from "../../../../schemas/packet-state.schema.json" with { type: "json" };
import plannerReplaySchema from "../../../../schemas/planner-replay.schema.json" with { type: "json" };
import proposeCartSchema from "../../../../schemas/propose-cart.schema.json" with { type: "json" };
import scameterCaptureSchema from "../../../../schemas/scameter-capture.schema.json" with { type: "json" };
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

const ALL_SCHEMAS = [
  mandateSchema,
  mandateCredentialSchema,
  cartSchema,
  decisionSchema,
  logEntrySchema,
  cardRecordSchema,
  packetStateSchema,
  listingRecordSchema,
  scameterCaptureSchema,
  proposeCartSchema,
  plannerReplaySchema,
] as const;

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    strictRequired: true,
    allowUnionTypes: true,
    allErrors: true,
  });
  addFormats(ajv);
  for (const schema of ALL_SCHEMAS) ajv.addSchema(schema);
  return ajv;
}

const ajv = createAjv();

function toIssue(e: ErrorObject): ValidationIssue {
  return { path: e.instancePath || "/", keyword: e.keyword, message: e.message ?? "invalid" };
}

function compiled(ref: string): ValidateFunction {
  const fn = ajv.getSchema(ref);
  if (!fn) throw new Error(`schema not registered: ${ref}`);
  return fn;
}

function makeValidator<T>(ref: string): Validator<T> {
  const fn = compiled(`${SCHEMA_ID_BASE}${ref}`);
  return (data: unknown) =>
    fn(data) ? { ok: true, value: data as T } : { ok: false, errors: (fn.errors ?? []).map(toIssue) };
}

export const validateMandate = makeValidator<Mandate>("mandate.schema.json");
export const validateMandateCredential = makeValidator<MandateCredential>("mandate-credential.schema.json");
export const validateCart = makeValidator<Cart>("cart.schema.json");
export const validateDecision = makeValidator<Decision>("decision.schema.json");
export const validateLogEntry = makeValidator<LogEntry>("log-entry.schema.json");
export const validateCardRecord = makeValidator<CardRecord>("card-record.schema.json");
export const validatePacketState = makeValidator<PacketState>("packet-state.schema.json");
export const validateListingRecord = makeValidator<ListingRecord>("listing-record.schema.json");
export const validateScameterCapture = makeValidator<ScameterCapture>("scameter-capture.schema.json");
export const validateProposeCartInput = makeValidator<ProposeCartInput>("propose-cart.schema.json");
export const validatePlannerReplayRecord = makeValidator<PlannerReplayRecord>("planner-replay.schema.json");
export const validateJudgeRecord = makeValidator<JudgeRecord>("decision.schema.json#/$defs/JudgeRecord");
export const validateEscalationAnswer = makeValidator<EscalationAnswer>("decision.schema.json#/$defs/EscalationAnswer");
export const validateCardEvent = makeValidator<CardEvent>("log-entry.schema.json#/$defs/CardEvent");
export const validateRevocation = makeValidator<Revocation>("mandate.schema.json#/$defs/Revocation");

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
