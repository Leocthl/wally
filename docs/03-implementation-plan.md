# 03 Implementation plan

## First-hour checklist
- Window: H0 to H1 [F61].

- [ ] **Ask organisers** (D-01): prize structure, judging weights, pitch length, pre-existing code rule, HKT sandbox and mentors, track counts [F14-F17].
- [ ] **Jev key smoke test** (B-01): one typed call; confirm model string and limits [F11b], record latency.
- [ ] **Lock scope** (X-09): ONE decision, ONE delegator (SR1); live stops S2, S1, S3; rail stays SIMULATED; cut order D9.
- [ ] **Capture 5 real listings** (D-05), screenshot and timestamp [F40].
- [ ] **Roles** (X-09): one owner per lane A-D and X; one Plus/Pro holder for kill test 1 [F1]; one zh-HK reader.
- [ ] **Repo** (X-01 to X-03): repo, remote, one branch or git worktree per lane, CI skeleton.
- [ ] **Kill tests D10**: start all three (below).

## Contracts first (H0-H2 [F41])
| Step | Output | Task |
|---|---|---|
| Schemas to types | `schemas/` Mandate, Cart, Decision, LogEntry, CardRecord, PacketState; generated types in `packages/core` (02 §Data model) | X-05 |
| Ports | `JudgePort`, `RailPort`, `LogStore`, `Clock` (00-context), `PlannerPort`, `Signer` (02 §Interfaces) | X-06 |
| Fixtures | mandate M0, packet [F20], attempts [F21-F23], flagged seller, injected listing; all SIMULATED | X-07 |
| Stub engine | `decide()` returns DENY citing a rule ID; in-memory log | A-01 |

- **Exit at H2 [F41]**: every package typechecks against the stubs. Later schema or port changes need the X owner and a channel note.

## Lanes
### A: policy + rail
- **Tasks**: A-01 to A-31. Packet math, R1-R12 (tests first), engine, crypto, log, rail-sim, calibration, orchestrator.
- **In**: schemas, fixtures, judge record from B, the real decline (D-03).
- **Out**: `engine.decide`, `verifyChain`, `RailPort` implementation (SIMULATED rail), orchestrator API for C, engine and rail-sim for D.
- **Done**: every rule R1-R12 unit-tested with tests written first; T-I1..T-I8, T-S1..T-S6, T-R1 green; log verifies offline (T-V1); coverage of `packages/core` meets [F44]; no PAN or CVV anywhere (I8); rail outputs carry a SIMULATED label; `pnpm test` green.

### B: agent + Jev
- **Tasks**: B-01 to B-13. Planner, `JudgePort` contract tests, llm fallback, Jev adapter, shadow mode.
- **In**: Cart schema, listing text, Scameter capture, thresholds [F36, F50, F51].
- **Out**: `JudgePort` implementations (`jev`, `llm`), planner, judge logs.
- **Done**: planner can call only `propose_cart` (I4); Jev adapter and llm fallback pass the JudgePort contract tests including timeout and error ⇒ fail closed (I5); shadow mode logs judge output with no effect; model version and latency logged; fixtures for S2 and S3 give the expected judge outputs; no secrets in the repo.

### C: UI + verifier
- **Tasks**: C-01 to C-14. Tokens, shell, seal, run, console, log, verifier, evidence, presenter, accessibility.
- **In**: orchestrator API (stub until A-26), log entries, harness results (D-11), 04.
- **Out**: `apps/web`, `apps/verifier`.
- **Done**: screens seal, run, console, log + verifier, evidence, presenter built to 04; every number wears a provenance chip; stop banners render from rule templates; verifier works offline and fails on tamper (T-V1); contrast and 44px touch targets pass; mobile-first view; reduced motion respected.

### D: evidence + pitch
- **Tasks**: D-01 to D-21. Asks, kill tests, captures, harness, baselines, metrics, stopwatch, 09, deck, rehearsals, video.
- **In**: engine, rail-sim, judge adapters, fixtures, injection corpus (B-11).
- **Out**: harness results, `data/` captures, 05-07 and 09, deck, backup video.
- **Done**: at least 100 seeded scenarios (target 150-200) [F37] run through B0, B1, B2 with MEASURED(n) results; captures logged in data/capture-sheet.md; real-card test and shop probe done or marked skipped with the reason; four timed rehearsals [F41]; backup video recorded; deck matches 07; every touched register row is OBSERVED or still READ-BY-CLAUDE.

### X: cross-lane
- **Tasks**: X-01 to X-14. Repo, CI, docs-check, schemas, ports, fixtures, integration, T-E2E, gate checks.
- **In**: lane branches. **Out**: `schemas/`, `data/fixtures/`, CI, green `main`.
- **Merge**: at each gate, in the order X, A, B, C, D; a red lane does not merge.
- **Done**: CI green (typecheck, lint, test, docs-check); T-E2E passes DM1-DM7; each gate M1-M5 recorded in TASKS.md; no lane merged red.

## Gates
- Critical path to M1: X-05, X-06, A-01, A-15, A-26; A-17 to A-19, A-22, A-31 run alongside.

| Gate | Hour [F41] | Pass test |
|---|---|---|
| M1 | H6 | End-to-end happy path (seal, propose, decide, mint, checkout) plus one stop; signed log verifies offline; judge and rail may be fakes |
| M2 | H12 | Rail-sim (SIMULATED rail) and judge gate live, shadow mode allowed; T-S1 to T-S3 green |
| M3 | H20 | Harness runs at least 100 scenarios [F37] through B0, B1, B2 |
| M4 | H28 | UI complete (seal, run, console, log + verifier, evidence, presenter); T-E2E green |
| M5 | H34 | Freeze: judge thresholds fixed, bug fixes only |
| M6 | after M5 | Four timed rehearsals [F41] and backup video; pitch time TBC (D-01) |

## Kill tests (D10)
- Start all three before H2; test 1 has a hard stop at H12 [F41].

| Test | Task | Decision rule |
|---|---|---|
| Real-card decline: a human types the card, limit set below the total [F40] | D-03 | No test by H12: sim-only, say so everywhere |
| Shop probe: 10 stores, 4 checks each [F39] | D-04 | Fewer than 4 of 10 [F39] hostile to agents: drop the shop-side claim |
| Ask an HKT mentor if a delegate SUC API is planned [F17] | D-02 | Yes: retarget our ask (09) to merchant-side acceptance |

## Triggers [F41]
| Hour | Condition | Action |
|---|---|---|
| H2 | No Jev key | `JUDGE_PROVIDER=llm` only; Jev adapter stays a stub behind `JudgePort` |
| H6 | No end-to-end stop | Cut crypto to hash-chain only; label the log unsigned in UI and deck |
| H10 | End-to-end stop still failing | Contingency D8 (see 08) |
| H12 | No real-card test | Sim-only; drop the calibration claim; say so in UI, README, deck |

## Collapse plan, team of 3 [F13]
| Person | Lanes |
|---|---|
| P1 | A + X (critical path) |
| P2 | B + harness (D-08 to D-11), starting when A-20 lands |
| P3 | D-01 to D-07 and D-12 first, then C |
| All | After M4 [F41], share D-13 to D-21: P1 demo script and rehearsals, P2 evidence map, P3 deck and ask page |

- Pre-cut A-30, B-13, D-19. Then apply D9 in order at each missed gate.

## Sleep rota
- One person off 4 h at a time [F41]. Windows do not overlap and do not span a gate or trigger check.
- Back to back from M2 [F41]: A, B, C, D owners (team of 3: A, B, C).
- Before leaving: tick Done boxes in TASKS.md, add one hand-off line per open task.

## Cut order (D9)
1. Teen chain (A-30)
2. Screenshot intake (B-13)
3. Reconciliation (D-19)
4. did:key (keep Ed25519)
5. Harness 200 to 100 scenarios [F37]
6. Scameter to manual capture only (D-07)

- Cut the next item when a gate is missed. Sleep is not on the list.
