# 10 Test plan

- **Stack**: vitest + fast-check, Playwright for browser checks.
- **Scope**: CI uses recorded fixtures and mocks: no live calls, no key, SIMULATED rail. Live checks skip when their server is down.

## Property tests
| ID | Property over generated inputs |
|---|---|
| T-I1 | `rail.mint` only after APPROVE for that cart; a repeat returns the same card |
| T-I2 | Minted limit equals approved total, <= min(remaining, ceiling [F1]) |
| T-I3 | No judge output turns DENY or ESCALATE into APPROVE |
| T-I4 | Planner output is one `propose_cart`, no credential or description; lint bans signing imports |
| T-I5 | Injected model, rail or log failure (timeout, throw, malformed output): DENY or ESCALATE, no mint, no double charge |
| T-I6 | No mint after revoke or expiry, including races |
| T-I7 | One signed entry per decision; `verifyChain` passes |
| T-I8 | No PAN-like digit run or CVV field in logs, fixtures, prompts |

## Scenario tests
| ID | Setup | Expected |
|---|---|---|
| T-S1 | Packet HK$800 [F20], mint HK$259 [F21], cart HK$550 [F22] vs HK$541 left | R3 DENY; `overshoot` on the live card (DM2): `OVER_LIMIT`, limit held |
| T-S2 | Flagged seller (SIMULATED); unverified seller | R9 DENY; R9 ESCALATE; no card |
| T-S3 | Injected instructions in the description | P(injection) >= `T_inj` [F36]; R10 DENY |
| T-S4 | Revoke before mint or first use | `MANDATE_REVOKED`, then R2 DENY; or `CARD_EVENT(VOIDED)` |
| T-S5 | ESCALATE unanswered past the window [F31] | R11 DENY resolves it |
| T-S6 | More than 3 mints in 10 min [F32]; expired mandate | R7 DENY; R2 DENY, `PACKET_EXPIRED` |

## Contract and component checks
| Check (task) | Expected |
|---|---|
| Credential (A-32; R1) | Published W3C, RFC 8785, RFC 8032 vectors pass; a tampered, unpinned, wrong-issuer or `@context`-less proof fails R1. One `it.fails` probe stays red: a caller-built Mandate widening only the categories passes engine R1 (see 08) |
| Rail (A-33, A-34) | Replay → `CARD_USED`; other domain → `MERCHANT_MISMATCH`; timeout, same-key retry: one charge |
| Orchestrator, executor (A-23, A-26) | One queue; failure → `{ ok: false }`, no mint; re-fold before mint; `LOG_EXISTS`; checkout after revoke DENIED; unlogged card refused; wrong-cart or unsigned answer → DENY R11; booth server guards and caps |
| JudgePort (B-04, B-14) | laya, jev, replay on a mock: timeout, error, malformed, unknown option, truncation fail closed; padding → ESCALATE [F26] |
| Planners, compiler (B-18, M-03, M-04) | Same input, same proposal; small margin abstains; `local` off-catalogue or failed → none; compiler failure → fallback |

## Harness, rail, verifier, end to end
| ID | Check |
|---|---|
| T-H1 | 0 over-limit mints, deterministic scenarios [F38] |
| T-H2 | At least 90% of legitimate scenarios approved [F38], reported three ways ([05](05-evidence-plan.md)) |
| T-H3 | Every reported number is MEASURED(n) with seed and commit; lint blocks harness copies of core |
| T-V1 | Untouched log passes; byte flip, truncation, reorder, wrong key fail; step 9: card without its APPROVE, second card, wrong-cart consent, overspend, mint after revoke fail at that entry |
| T-R1 | F1 parity: one payment, validity, ceiling, max active [F1]; calibration on the real decline (`data/real-card-test.md`), else sim-only |
| T-E2E | DM1-DM7 on the SIMULATED rail with chips (Playwright, on-device build); verifier fails after tamper; booth smoke (X-17): every scenario offline, no key, Laya stopped → ESCALATE |

## CI (X-03)
- **Steps**: `gen-types --check` (types, precompiled validators), `typecheck`, `lint` (import boundaries), `test`, `coverage` (core [F44]), `docs-check`. A red step blocks merge to `main`.
