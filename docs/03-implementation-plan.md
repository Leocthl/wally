# 03 Implementation plan

## First-hour checklist
- Window: H0 to H1 [F61].

- [x] **Foundation** (X-02 to X-08, A-01): scaffold, V2 schemas, ports, fixtures, stub engine; the lead merges.
- [x] **Worktrees** (X-15): `.worktrees/<name>` on branch `lane/<name>` per lane.
- [x] **Laya smoke test** (B-01): four questions on 127.0.0.1:8808 [F11c]; shape in `services/laya/FINDINGS.md`.
- [ ] **Ask organisers** (D-01): HKT sandbox and mentors [F17], booth power and network, submission form [F18].
- [ ] **Lock scope** (X-09): ONE decision, ONE delegator (SR1); live stops S2, S1, S3; rail stays SIMULATED; two local models, Laya judges and Qwen plans (D15); cut order D9.
- [ ] **Capture 5 real listings** (D-05), screenshot and timestamp [F40].
- [ ] **Roles** (X-09): lane owners; a Plus/Pro holder for kill test 1 [F1]; a zh-HK reader; booth rota (D-27).
- [ ] **Kill tests D10**: start all three (below).

## Contracts first (H0-H2 [F41])
| Step | Output | Task |
|---|---|---|
| Schemas to types | `schemas/` MandateCredential, Mandate, Cart, Decision, LogEntry, CardRecord, PacketState; generated types in `packages/core` (02 §Data model) | X-05 |
| Ports | `JudgePort`, `RailPort`, `MerchantPort`, `LogStore`, `Clock`, `PlannerPort`, `Signer` (02 §Interfaces) | X-06 |
| Fixtures | mandate M0, packet [F20], attempts [F21-F23], flagged seller, injected listing; all SIMULATED | X-07 |
| Stub engine | `decide()` returns DENY citing a rule ID; in-memory log | A-01 |

- **Exit at H2 [F41]**: every package typechecks against the stubs. Later schema or port changes need the X owner and a channel note.

## Lanes
### A: policy + rail
- **Tasks**: A-01 to A-35: rules tests first, credential, log, rail-sim, orchestrator, booth API.
- **In**: schemas, fixtures, judge record from B, the real decline (D-03).
- **Out**: `engine.decide`, `verifyMandateCredential`, `verifyChain`, `RailPort` (SIMULATED rail), the orchestrator for C, engine and rail-sim for D.
- **Done**: CLAUDE.md, Definition of done, lane A.

### B: agent + judge
- **Tasks**: B-01 to B-21 (B-02, B-05, B-16, B-17 dropped): Laya, `SystemOneJudge`, Laya decision-loop planner, `replay`, corpora, threshold fit.
- **In**: Cart schema, structured listings, description text, Scameter capture, thresholds [F36, F50].
- **Out**: `JudgePort` (`laya`, `jev`, `replay`), `PlannerPort` (`rule`, `local`, `replay`), judge and planner traces.
- **Done**: CLAUDE.md, Definition of done, lane B.

### C: UI + verifier
- **Tasks**: C-01 to C-20: screens, verifier, booth, scenario picker, credential panel, accessibility.
- **In**: orchestrator API (stub until A-26), log entries, harness results (D-11), 04.
- **Out**: `apps/web` (PWA, booth server), `apps/verifier`.
- **Done**: CLAUDE.md, Definition of done, lane C.

### D: evidence + pitch
- **Tasks**: D-01 to D-28: kill tests, captures, harness and baselines, deck, video, submission, freeze.
- **In**: engine, rail-sim, judge adapters, fixtures, corpora (B-11, B-19).
- **Out**: harness results, `data/` captures, 05-07 and 09, deck, 3-minute video, submission package, booth kit.
- **Done**: CLAUDE.md, Definition of done, lane D.

### M: mobile, second model, brand
- **Tasks**: M-01 to M-11: Wally rename, Qwen service, local planner and compiler, design system, PWA shell, screens, on-device mode, key on the phone, LAN mode, device pass.
- **Done**: Qwen files pinned and measured; planner and compiler fail to a fallback and never throw; the booth runs offline in on-device mode.

### X: cross-lane
- **Tasks**: X-01 to X-19: worktrees, CI, contracts, integration, T-E2E with booth smoke, freeze guard, credits.
- **In**: the `lane/<name>` branches. **Out**: `schemas/`, `data/fixtures/`, CI, green `main`.
- **Merge**: at each gate, in the order X, A, B, C, D; a red lane does not merge.
- **Done**: CLAUDE.md, Definition of done, lane X.

## Gates
- Critical path to M1: X-05, X-06, A-01, A-32, A-15, A-26; A-17 to A-19, A-22, A-31, B-15 run alongside.

| Gate | Hour [F41] | HKT [F41] | Pass test |
|---|---|---|---|
| M1 | H6 | Sat 02:45 | End-to-end happy path (seal credential, propose, decide, mint, checkout) plus one stop; signed log verifies offline; judge and rail may be fakes |
| M2 | H12 | Sat 08:45 | Rail-sim with token features and the Laya judge live, shadow mode allowed; T-S1 to T-S3 green |
| M3 | H20 | Sat 16:45 | Harness runs at least 100 scenarios [F37] through B0, B1, B2; booth screen runs on the real engine |
| M4 | H28 | Sun 00:45 | UI complete incl. booth; T-E2E with booth smoke green |
| M5 | H34 | Sun 06:45 | Feature freeze: thresholds fixed, bug fixes only |
| M6 | after M5 | Sun 07:00-12:00 | Four timed rehearsals [F41], 3-minute video, submission (§Freeze) |

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
| H2 | Laya smoke test fails | Planner `replay`; recorded judge outputs, labelled; live judge calls ESCALATE (I5) |
| H6 | No end-to-end stop | Cut log signing to hash-chain only (credential proof stays); label the log unsigned |
| H10 | End-to-end stop still failing | Contingency D8 (see 08) |
| H12 | No real-card test | Sim-only; drop the calibration claim; say so in UI, README, deck |

## Freeze and submission [F16, F18, F41]
- [ ] **M6**: rehearsals on both clocks [F45, F42]; video (D-18); deck (D-15).
- [ ] **Before Sun 13:00 HKT**: final merge to `main`; repo public, link checked logged out; README Credits and `THIRD_PARTY.md` complete [F16]; declaration of the HKT problem statement, Raccoon only if really used [F15]; form submitted with deck, repo link, video (D-25).
- [ ] **After Sun 13:00 HKT**: no commits, pushes, tags or repo setting changes [F16]; freeze guard on (X-18). The booth and the stage run from the frozen commit.

## Collapse plan, team of 3 [F13]
| Person | Lanes |
|---|---|
| P1 | A + X (critical path) |
| P2 | B + harness (D-08 to D-11, D-22, D-28), starting when A-20 lands |
| P3 | D-01 to D-07 and D-12 first, then C (booth first) |
| All | After M4 [F41]: P1 demo and rehearsals, P2 evidence map, P3 deck, video, submission |

- Pre-cut A-30, B-13, D-19. Then apply D9 in order at each missed gate.

## Sleep rota
- One person off 4 h at a time [F41]. Windows do not overlap and do not span a gate or trigger check.
- From M2 [F41], in lane order A, B, C, D.
- Before leaving: tick Done boxes in TASKS.md, add one hand-off line per open task.

## Cut order (D9)
1. Teen chain (A-30)
2. Screenshot intake (B-13)
3. Reconciliation (D-19)
4. Harness 200 to 100 scenarios [F37]
5. Scameter to manual capture only (D-07)

- did:key and the credential are not cut: HKT's workshop centres on DID-VC [F19]. Optional by design, never on the critical path: hosted Jev. The claude planner is removed.
- Cut the next item when a gate is missed. Sleep is not on the list.
