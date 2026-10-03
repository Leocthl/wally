# 10 Test plan

- **Stack**: vitest + fast-check; Playwright and axe, run locally. CI runs on recorded fixtures, no live calls or key; live checks skip when down.

## Property tests
| ID | Property over generated inputs |
|---|---|
| T-I1 | Mint only after APPROVE for that cart; a repeat returns the same card |
| T-I2 | Minted limit equals approved total, <= min(remaining, ceiling [F1]) |
| T-I3 | No judge output turns DENY or ESCALATE into APPROVE |
| T-I4 | Planner output is one `propose_cart`; lint bans signing imports |
| T-I5 | Injected model, rail or log failure: DENY or ESCALATE, no mint, no double charge |
| T-I6 | No mint after revoke or expiry |
| T-I7 | One signed entry per decision; `verifyChain` passes |
| T-I8 | No PAN-like digit run or CVV field in logs, fixtures, prompts |

## Scenario tests
| ID | Setup | Expected |
|---|---|---|
| T-S1 | Packet HK$800 [F20], mint HK$259 [F21], cart HK$550 [F22] vs HK$541 left | R3 DENY; `overshoot` on the live card (DM2): `OVER_LIMIT`, limit held |
| T-S2 | Flagged seller (SIMULATED); unverified seller | R9 DENY; R9 ESCALATE; no card |
| T-S3 | Injected instructions in a listing | P(injection) >= `T_inj` [F36]; R10 DENY |
| T-S4 | Revoke before mint or first use | `MANDATE_REVOKED`, then R2 DENY; or `CARD_EVENT(VOIDED)` |
| T-S5 | ESCALATE unanswered past the window [F31] | R11 DENY resolves it |
| T-S6 | More than 3 mints in 10 min [F32]; expired mandate | R7 DENY; R2 DENY, `PACKET_EXPIRED` |

## Contract and component checks
| Check | Expected |
|---|---|
| Credential (A-32; R1) | W3C, RFC 8785 and RFC 8032 vectors pass; a tampered, unpinned, wrong-issuer or `@context`-less proof fails R1; one `it.fails` probe stays red (08) |
| Rail (A-33, A-34) | Replay → `CARD_USED`; other domain → `MERCHANT_MISMATCH`; same-key retry after a timeout: one charge |
| Orchestrator (A-23, A-26) | Failure → `{ ok: false }`, no mint; a live repeat returns the earlier decision; bad answer → DENY R11 |
| JudgePort (B-04, B-14) | Timeout, error, truncation fail closed; padding → ESCALATE [F26]; at least 10% CJK letters → ESCALATE `R10.unavailable` (`unsupported_language`), never an injection DENY; a hard rule still outranks it [F104] |
| Planners, compiler, family, booth server (X-10) | Same input, same proposal; `local` off-catalogue → none; compiler failure → fallback; a wider child → `EXCEEDS_PARENT`; LAN guards: token, Host, Origin, CORS |
| Web (C-13) | Contrast pairs; no raw colours or durations; axe at three phone widths; offline `?api=local`; first run once, `?booth=1` skips it (e2e `onboarding`, `home`) |
| Display modes | Plain default, Developer mode, `?dev=1`, `?dev=0`; changed-copy banner. About 30 new unit files; e2e `a11y-modes`, evidence, proof; the Pages spec checks the checker page |

## Harness, rail, verifier, end to end
| ID | Check |
|---|---|
| T-H1 | 0 over-limit mints, deterministic scenarios [F38] |
| T-H2 | At least 90% of legitimate scenarios approved [F38] ([05](05-evidence-plan.md)); the final run met both [F69] |
| T-H3 | Every reported number is MEASURED(n) with seed and commit; lint blocks harness copies of core |
| T-V1 | Untouched log passes; byte flip, truncation, reorder, wrong key, step 9 breaks fail there |
| T-R1 | F1 parity; calibration on the real decline (`data/real-card-test.md`), else sim-only |
| T-E2E | DM1-DM7 on the SIMULATED rail with chips (Playwright); tamper fails the verifier; booth smoke (X-17): scenarios offline, no key, Laya stopped → ESCALATE |

## CI (X-03)
- **Steps**: `gen-types --check`, `typecheck`, `lint`, `test`, `coverage` (core [F44]), `docs-check`. Over 6,000 tests, core coverage above 95% [F91].
