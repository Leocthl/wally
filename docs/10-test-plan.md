# 10 Test plan

- **Stack**: vitest + fast-check (suggested; X-02 decides). Policy engine tests first: commit them red, then write the rules (A-03 to A-15).
- **Scope**: CI replays recorded planner and judge fixtures, no live calls (smoke runs are manual: B-01, B-06). Every test runs on the SIMULATED rail.

## Property tests
| ID | Property over generated inputs |
|---|---|
| T-I1 | `rail.mint` runs only after APPROVE for that cart |
| T-I2 | Minted limit equals approved total and is <= min(remaining, ceiling [F1]) |
| T-I3 | No judge output turns DENY or ESCALATE into APPROVE |
| T-I4 | Planner tools are exactly `propose_cart`; no credential in planner context; lint bans signing and rail-sim imports in `packages/agent` |
| T-I5 | Injected timeout, throw, malformed output, unknown enum, `refusal`, `max_tokens` or log write failure gives DENY or ESCALATE and no mint |
| T-I6 | No mint after revoke or expiry, including races |
| T-I7 | One signed entry per decision; `verifyChain` passes on every run |
| T-I8 | No PAN-like digit run or CVV field in logs, fixtures, prompts, rendered UI |

## Scenario tests
| ID | Setup | Expected |
|---|---|---|
| T-S1 | Packet HK$800 [F20], mint HK$259 [F21], cart HK$550 [F22] against HK$541 left | R3 DENY (`R3.over_remaining`). Also: stub mode `overshoot` on the live card (DM2), rail declines `OVER_LIMIT` (`CARD_EVENT(DECLINED)`), limit held |
| T-S2 | Flagged seller (SIMULATED); unverified seller | R9 DENY (`R9.flagged`); R9 ESCALATE (`R9.unverified`); no card |
| T-S3 | Listing with injected instructions | Injection probability >= `T_inj` [F36]; R10 DENY (`R10.injection`) |
| T-S4 | Revoke before mint; revoke before first use | `MANDATE_REVOKED`, then R2 DENY; or `CARD_EVENT(VOIDED)` |
| T-S5 | ESCALATE unanswered past the window [F31] | R11 DENY resolves it (`R11.expired`) |
| T-S6 | More than 3 mints in a rolling 10 min [F32]; expired mandate | R7 DENY; R2 DENY with `PACKET_EXPIRED` |

## Harness, rail, verifier, end to end
| ID | Check |
|---|---|
| T-H1 | 0 over-limit mints in deterministic scenarios [F38] |
| T-H2 | At least 90% of legitimate scenarios approved [F38] |
| T-H3 | Every reported number is MEASURED(n) with seed and commit; latency and cost are ours; lint blocks copies of core's engine and rail-sim in the harness |
| T-V1 | Untouched log passes; byte flip, truncation, reorder, wrong key fail; no network request |
| T-R1 | Parity with F1 semantics: one-payment expiry, validity, ceiling, active-card maximum [F1]; calibration on the one real decline (`data/real-card-test.md`); skipped and tagged sim-only if D-03 is missing |
| T-E2E | DM1-DM7 on the SIMULATED rail; SIMULATED chip on every rail screen; verifier fails after tamper |

## CI (X-03)
1. `typecheck`
2. `lint`
3. `test`, `packages/core` coverage meets [F44]
4. `docs-check`: unknown F-IDs, PAN-like digit runs, secret patterns

- A red step blocks merge to `main`.
