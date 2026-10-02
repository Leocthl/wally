// Request validators of the booth API. They are portable (src/booth/backend/validate.ts): the on-device client runs
// the same checks on every call from the UI.
export {
  MAX_INTENT_CHARS,
  MAX_REQUEST_CHARS,
  MAX_REVOKE_REASON_CHARS,
  parseAlternativesRequest,
  parseAnswerRequest,
  parseAskRequest,
  parseCompileRequest,
  parseEmptyBody,
  parseProposeRequest,
  parseRevokeRequest,
  parseScenarioId,
  parseSealRequest,
} from "../../src/booth/backend/validate";
