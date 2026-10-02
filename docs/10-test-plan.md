# 10 Test plan

- **Stack**: vitest + fast-check; engine tests committed red first (A-03 to A-15).
- **Scope**: CI uses recorded fixtures and mock servers: no live calls, no key, SIMULATED rail only.

## Property tests
| ID | Property over generated inputs |
|---|---|
| T-I1 | `rail.mint` runs only after APPROVE for that cart; a repeat mint returns the same card |
| T-I2 | Minted limit equals approved total and is <= min(remaining, ceiling [F1]) |
| T-I3 | No judge output turns DENY or ESCALATE into APPROVE |
| T-I4 | Planner output is one `propose_cart` input; no credential or description in its context; lint bans signing and rail-sim imports |
| T-I5 | Injected timeout, throw, malformed or truncated output, Laya down, rail timeout or log failure: DENY or ESCALATE, no mint, no double charge |
| T-I6 | No mint after revoke or expiry, including races |
| T-I7 | One signed entry per decision; `verifyChain` passes on every run |
| T-I8 | No PAN-like digit run or CVV field in logs, fixtures, prompts, UI |

## Scenario tests
| ID | Setup | Expected |
|---|---|---|
| T-S1 | Packet HK$800 [F20], mint HK$259 [F21], cart HK$550 [F22] against HK$541 left | R3 DENY (`R3.over_remaining`). Also `overshoot` on the live card (DM2): `OVER_LIMIT`, limit held |
| T-S2 | Flagged seller (SIMULATED); unverified seller | R9 DENY (`R9.flagged`); R9 ESCALATE (`R9.unverified`); no card |
| T-S3 | Listing description with injected instructions | Injection probability at or above `T_inj` [F36]; R10 DENY (`R10.injection`) |
| T-S4 | Revoke before mint; revoke before first use | `MANDATE_REVOKED`, then R2 DENY; or `CARD_EVENT(VOIDED)` |
| T-S5 | ESCALATE unanswered past the window [F31] | R11 DENY resolves it (`R11.expired`) |
| T-S6 | More than 3 mints in a rolling 10 min [F32]; expired mandate | R7 DENY; R2 DENY with `PACKET_EXPIRED` |

## Contract and component checks
| Check (task; under) | Expected |
|---|---|
| Credential golden vectors (A-32; R1, T-V1) | Frozen vector verifies; tampered subject, wrong key or cryptosuite fail R1 |
| Blocked replay, merchant mismatch (A-33; T-R1) | Used token → `CARD_USED`; other domain → `MERCHANT_MISMATCH` |
| Idempotent mint and retry (A-34; T-I1, T-I5) | Stub `timeout`, same-key retry: one charge, one event |
| JudgePort contract (B-04; T-I5) | laya, jev, replay on a mock server: timeout, error, malformed, unknown option, truncated fail closed |
| Padding attack (B-14; T-S3) | Injection after padding → ESCALATE `R10.unavailable`, never APPROVE [F26] |
| Rotation averaging (B-14, B-18) | Position-biased mock → order-independent probabilities |
| Live Laya (B-01; optional) | Four answers in shape; skipped if the server is down |
| Planner loop (B-15, B-18) | Same input and Laya mock, same proposal; small margin abstains |

## Harness, rail, verifier, end to end
| ID | Check |
|---|---|
| T-H1 | 0 over-limit mints in deterministic scenarios [F38] |
| T-H2 | At least 90% of legitimate scenarios approved [F38] |
| T-H3 | Every reported number is MEASURED(n) with seed and commit; lint blocks harness copies of the engine and rail-sim |
| T-V1 | Untouched log passes; byte flip, truncation, reorder, wrong key fail; credential proof verifies; offline |
| T-R1 | F1 parity: one-payment expiry, validity, ceiling, max active [F1]; calibration on the real decline (`data/real-card-test.md`), else tagged sim-only |
| T-E2E | DM1-DM7 on the SIMULATED rail with chips; verifier fails after tamper. Booth smoke (X-17): warm-up, every scenario offline, no key; Laya stopped → ESCALATE |

## CI (X-03)
- **Steps**: `typecheck`, `lint`, `test` (`packages/core` coverage [F44]), `docs-check` (unknown F-IDs, PAN-like digit runs, secrets). A red step blocks merge to `main`.
