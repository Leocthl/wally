# TASKS

## Top 10 do-first
1. **X-01** Repo, remote, one branch or git worktree per lane. Every lane waits on it.
2. **X-02** Workspace scaffold and tooling. Lanes need somewhere to run tests.
3. **X-05, X-06, X-07** Contracts: schemas to types, ports, fixtures. Due at H2 [F41].
4. **D-01, D-02** Ask organisers and an HKT mentor in one conversation. Answers set pitch length, code rule, sandbox, API roadmap [F14-F17].
5. **B-01** Jev key smoke test. No key at H2 [F41] means fallback only.
6. **D-03** Real-card decline test, kill test 1. Needs a Plus/Pro holder [F1]; a human types the card.
7. **D-04** Shop probe, kill test 2. Pass line is fixed before probing [F39].
8. **D-05** Capture 5 real listings [F40]. Inputs for planner and judge tests.
9. **A-03 to A-14** R1-R12, each tests first. R1-R6 gate M1, R7-R12 gate M2.
10. **X-04** docs-check script. Blocks unknown F-IDs, PAN-like digit runs and secrets from the first commit.

## Backlog
- Milestones: M1 H6, M2 H12, M3 H20, M4 H28, M5 H34 [F41]; M6 is four timed rehearsals [F41] plus backup video. Contract tasks (X-05 to X-07, A-01) are due at H2 [F41] inside M1. Est is wall-clock hours with a Claude Code session on the task. Owner `[TEAM]` is a name to fill in. Tick Done when merged to `main` with CI green.

### Lane X: cross-lane
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| X-01 | Create repo and remote; protect `main`; one branch or git worktree per lane (A, B, C, D, X) | [TEAM] | 0.5h | none | M1 | [ ] |
| X-02 | Scaffold pnpm workspace per 02 §Stack and repo layout: `apps/web`, `apps/verifier`, `packages/core`, `rail-sim`, `agent`, `harness`, `schemas`, `data`; tsconfig base, vitest, fast-check, eslint; scripts `typecheck`, `lint`, `test`, `docs-check` | [TEAM] | 1h | X-01 | M1 | [ ] |
| X-03 | CI on every push: typecheck, lint, test, docs-check. Lint carries import-boundary rules: `agent` imports no signing or rail-sim (I4), `harness` reuses core, `verifier` imports `verifyChain` and types only. Coverage gate for `packages/core` [F44] | [TEAM] | 1h | X-02, X-04 | M1 | [ ] |
| X-04 | docs-check script (start from `scripts/docs-check.py`), tests first on good and bad samples: fail on unknown F-IDs, PAN-like digit runs (with or without spaces or hyphens), secret patterns; scan docs, data, schemas, code | [TEAM] | 1.5h | X-02 | M1 | [ ] |
| X-05 | Schemas to types per 02 §Stack and repo layout: generated types and one ajv validator per schema (Mandate, Cart, Decision, LogEntry, CardRecord, PacketState); validate at every boundary | [TEAM] | 1h | X-02 | M1 | [ ] |
| X-06 | Ports in `core` (02 §Interfaces): `JudgePort`, `RailPort`, `LogStore`, `Clock`, `PlannerPort`, `Signer`. Fakes so M1 runs end to end: judge allows, rail mints and declines above the limit, merchant is honest | [TEAM] | 1h | X-05 | M1 | [ ] |
| X-07 | Fixtures in `data/fixtures/`: mandate M0, packet [F20], attempts [F21-F23], flagged seller, injected listing; each labelled SIMULATED, no real person's identifiers | [TEAM] | 1.5h | X-05 | M1 | [ ] |
| X-08 | `.env.example` listing the names in 02 §Env config; `.gitignore` for `.env`, `.keys/`, `.data/`, `data/raw/`; secret patterns in docs-check | [TEAM] | 0.25h | X-02 | M1 | [ ] |
| X-09 | Lock scope and roles; write owners into this file; contract-change rule (a schema or port change needs the X owner and a channel note) | [TEAM] | 0.5h | none | M1 | [ ] |
| X-10 | Integrate: compose orchestrator, judge adapters and rail-sim in `apps/web`; merge lane branches at each gate | [TEAM] | 2h | A-26, B-05, C-02 | M2 | [ ] |
| X-11 | T-E2E: scripted DM1-DM7 on the SIMULATED rail; asserts SIMULATED chips and verifier failure after tamper | [TEAM] | 3h | X-10, C-09, X-14 | M4 | [ ] |
| X-12 | Fill CLAUDE.md commands (typecheck, lint, test, docs-check, keys:gen, demo:reset) and README quickstart once the scaffold exists | [TEAM] | 0.25h | X-03 | M1 | [ ] |
| X-13 | Gate keeper: run each gate and trigger check (H2, H6, H10, H12 [F41]); record pass or miss with time in this file | [TEAM] | 1h | none | M1-M5 | [ ] |
| X-14 | `pnpm demo:reset` per 06 §Reset: packet to HK$800 [F20], zero cards, log and escalations cleared, fixtures reloaded, demo keys regenerated, PresenterBar at step 0 in SIMULATED; never touches `data/` captures | [TEAM] | 1h | A-26, X-07, C-02 | M4 | [ ] |

### Lane A: policy + rail
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| A-01 | Stub engine: `decide()` returns DENY citing a rule ID; in-memory `LogStore`; fake `Clock` | [TEAM] | 0.5h | X-06 | M1 | [ ] |
| A-02 | Packet math (U1), `foldPacket`: remaining = sealed amount less committed and settled; commit on mint, release on `VOIDED` or `EXPIRED`, settle on `AUTHORISED` with the actual amount; fold from the log; integer minor units. Tests first: never negative, release restores | [TEAM] | 1.5h | A-01 | M1 | [ ] |
| A-03 | R1 mandate signature valid (delegator key). Tests first: tampered mandate, wrong key | [TEAM] | 0.25h | A-01, A-17 | M1 | [ ] |
| A-04 | R2 not revoked, not expired (`R2.revoked`, `R2.expired`). Tests first | [TEAM] | 0.25h | A-01 | M1 | [ ] |
| A-05 | R3 total <= remaining, total includes shipping, fees, FX (`R3.over_remaining`). Tests first, including the cart over HK$541 left [F22] | [TEAM] | 0.25h | A-02 | M1 | [ ] |
| A-06 | R4 per-purchase cap, fixed or adaptive share of remaining; above `ask_above` returns ESCALATE (`R4.over_cap`, `R4.ask_above`). Tests first | [TEAM] | 0.5h | A-02 | M1 | [ ] |
| A-07 | R5 total <= rail ceiling [F1]. Tests first | [TEAM] | 0.25h | A-01 | M1 | [ ] |
| A-08 | R6 merchant and category inside the mandate. Tests first | [TEAM] | 0.25h | A-01 | M1 | [ ] |
| A-09 | R7 velocity [F32]: rolling window read from the log, injected `Clock` (`R7.velocity`). Tests first | [TEAM] | 0.5h | A-01 | M2 | [ ] |
| A-10 | R8 active cards below the rail maximum [F1]. Tests first | [TEAM] | 0.25h | A-01 | M2 | [ ] |
| A-11 | R9 seller check: Scameter state and seller identifiers; a capture older than the max age [F52] counts as unverified; flagged DENY, unverified ESCALATE, "no record" is not "safe" [F6] (`R9.flagged`, `R9.unverified`). Tests first | [TEAM] | 0.75h | A-01, B-09 | M2 | [ ] |
| A-12 | R10 judge thresholds [F36, F50, F51] read from config; the judge can only tighten (I3) (`R10.injection`, `R10.seller_risk`, `R10.scope`). Tests first | [TEAM] | 0.75h | A-01, B-08 | M2 | [ ] |
| A-13 | R11 unanswered escalation after the window [F31] returns DENY (`R11.expired`). Tests first | [TEAM] | 0.5h | A-01 | M2 | [ ] |
| A-14 | R12 price drift voids the approval; new cart, new decision (`R12.price_drift`). Tests first | [TEAM] | 0.5h | A-01 | M2 | [ ] |
| A-15 | `engine.decide`: pure; runs R1-R12 as they land; hard rules R1-R8 and R12 cannot be overridden by an escalation resolution; every DENY or ESCALATE cites a rule ID | [TEAM] | 1.5h | A-03 to A-08 | M1 | [ ] |
| A-16 | Explanation templates (02 §Explanation templates): one pure render function per template ID (`R2.revoked` to `R12.price_drift`) from recorded inputs; golden tests; no LLM prose | [TEAM] | 1h | A-15 | M2 | [ ] |
| A-17 | Crypto per 02 §Crypto: Ed25519 sign and verify, JCS canonical JSON, SHA-256; `pnpm keys:gen` writes throwaway demo keys to gitignored `.keys/`, never committed; did:key encoding optional (cut fourth, D9) | [TEAM] | 1h | X-02 | M1 | [ ] |
| A-18 | Log: append-only `LogStore` (JSONL); exactly one signed entry per decision (I7), written before any side effect; head checkpoint | [TEAM] | 1h | A-17, X-05 | M1 | [ ] |
| A-19 | `verifyChain(entries, publicKeys, headCheckpoint)` returns pass or first failing seq. Tests first: byte flip, truncation, reorder (T-V1) | [TEAM] | 1.5h | A-18 | M1 | [ ] |
| A-20 | Rail-sim (SIMULATED) per 02 §Rail simulator: `mint`, `authorise`, `void`, `expireDue` with F1 semantics [F1]; masked last4 only (I8); decline codes; SIMULATED label on every output. Tests first (T-R1) | [TEAM] | 2h | X-06 | M2 | [ ] |
| A-21 | Rail-sim calibration (02 §Rail simulator): copy the decline wording, where it shows, submit-to-decline time and hold behaviour from D-03; no D-03 by H12 [F41] means tag sim-only | [TEAM] | 1h | A-20, D-03 | M2 | [ ] |
| A-22 | Executor in `core` (deterministic, never the planner) and merchant stub in `rail-sim` with modes `honest`, `overshoot`, `drift`, `preauth` (02 §Rail simulator): re-quote at checkout (R12), limit-held decline on overshoot (DM2) | [TEAM] | 1.5h | X-06 | M1 | [ ] |
| A-23 | Escalation lifecycle: OPEN, APPROVED, DENIED, EXPIRED; timer on `Clock`; hard rules stay un-overridable; T-S5 | [TEAM] | 1h | A-13, A-15 | M3 | [ ] |
| A-24 | Revoke: signed revoke, `MANDATE_REVOKED`, void unused cards, `CARD_EVENT(VOIDED)`; revoke-versus-mint race tests; T-S4 | [TEAM] | 1h | A-18, A-20 | M3 | [ ] |
| A-25 | Expiry and velocity scenarios: `PACKET_EXPIRED` entry, card `EXPIRED` event driven by `Clock`; T-S6 | [TEAM] | 0.5h | A-09, A-18, A-20 | M3 | [ ] |
| A-26 | Orchestrator per pipeline contract v0: per-packet queue serialising decide, append, mint, revoke and checkout; judge in parallel with preflight; timers; head checkpoint | [TEAM] | 2h | A-15, A-18, A-22, A-31 | M1 | [ ] |
| A-27 | Property tests T-I1 to T-I8 (fast-check): write red against A-01, turn green as rules land | [TEAM] | 1.5h | A-15, A-26 | M3 | [ ] |
| A-28 | Scenario tests T-S1 to T-S3 (the live stops) on the merchant stub and rail-sim | [TEAM] | 1h | A-20, A-22, A-26 | M2 | [ ] |
| A-29 | Coverage gate for `packages/core` [F44]; close gaps | [TEAM] | 1h | A-27 | M3 | [ ] |
| A-30 | Stretch, cut first (D9): teen chain, parent to teen to agent, caps compose | [TEAM] | 3h | A-26 | M4 | [ ] |
| A-31 | Cart builder in `core` (02 §Components): `propose_cart` input to Cart, priced from the listing record incl. shipping, fees, FX [F3]; the planner sets no money fields | [TEAM] | 1.5h | X-05, X-07 | M1 | [ ] |

### Lane B: agent + Jev
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| B-01 | Jev key smoke test: one typed call over the four judge questions; confirm model string and limits [F11b], record latency; update the F11b row | [TEAM] | 0.5h | none | M1 | [ ] |
| B-02 | Read the claude-api skill first. Planner behind `PlannerPort` (02 §Planner): Messages API, one tool `propose_cart`, `tool_choice` auto with a strict tool [F62]; own process holding only `ANTHROPIC_API_KEY`; no payment tool (I4); timeout [F33]; `stop_reason` `refusal` or `max_tokens` fails closed (I5) | [TEAM] | 2h | X-06 | M1 | [ ] |
| B-03 | Listing ingest and planner prompt: listing text is untrusted data in a delimited block; no PAN or CVV in any prompt (I8); recorded fixtures in CI, no live calls | [TEAM] | 1.5h | B-02, X-07 | M1 | [ ] |
| B-04 | `JudgePort` contract tests shared by both adapters, tests first: timeout, error, malformed output, unknown option all fail closed (I5) | [TEAM] | 1h | X-06 | M1 | [ ] |
| B-05 | llm fallback judge (02 §Judge adapter): structured output on the same judge record schema, four questions; stricter thresholds [F51]; timeout [F34]; model version and latency logged | [TEAM] | 1.5h | B-04 | M2 | [ ] |
| B-06 | Jev adapter behind `JudgePort` (`@typesafe-ai/sdk`, one `systemOne` request, `jev-1.13.0` pinned [F11b]); client timeout F34 and retries 0, then fallback, then ESCALATE | [TEAM] | 2h | B-01, B-04 | M2 | [ ] |
| B-07 | Shadow mode via `JUDGE_MODE`: judge output logged with no effect on the decision; `enforce` for the demo | [TEAM] | 0.75h | B-05 | M2 | [ ] |
| B-08 | Judge config: thresholds [F36, F50, F51], `JUDGE_PROVIDER` (`jev` or `llm`), `JUDGE_MODE`, timeouts; no values in code | [TEAM] | 0.25h | X-06 | M1 | [ ] |
| B-09 | Seller-check input: Scameter capture loader, manual capture only (human-paced, ToS respected [F6]); states flagged, unverified, no record; capture age [F52] | [TEAM] | 1h | X-05 | M2 | [ ] |
| B-10 | Golden judge outputs for the S2 and S3 fixtures | [TEAM] | 0.75h | X-07, B-05 | M2 | [ ] |
| B-11 | Injection corpus: listing, review and image-alt text variants for judge tests and the harness | [TEAM] | 1h | B-05 | M3 | [ ] |
| B-12 | Latency and cost logging per call; MEASURED only, no vendor figure reported as ours | [TEAM] | 0.75h | B-05 | M2 | [ ] |
| B-13 | Stretch, cut second (D9): screenshot intake to a draft cart, only if it fits the D9 time-box | [TEAM] | 2h | B-03 | M4 | [ ] |

### Lane C: UI + verifier
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| C-01 | Read 04. Tokens (light and dark), fonts, base styles; `ProvenanceChip` first, no bare numbers | [TEAM] | 1.5h | X-02 | M2 | [ ] |
| C-02 | App shell and thin Node API with SSE live trace in `apps/web`; `PresenterBar` (step, reset, SIMULATED/REAL toggle per 06; REAL stays disabled until D-03 lands); runs on the stub engine until A-26 | [TEAM] | 1.5h | C-01, A-01 | M2 | [ ] |
| C-03 | Seal screen: `MandateEditor`, sentence to compiled rule chips side by side, editable, Seal | [TEAM] | 2.5h | C-02 | M2 | [ ] |
| C-04 | `PacketMeter` and `CardTicket` (masked last4, limit, TTL, state) | [TEAM] | 1.5h | C-01 | M2 | [ ] |
| C-05 | Run screen: live trace planner, judge, engine, rail; `CartCard`; `DecisionCard` (rule ID, inputs, comparator, judge probabilities, outcome) | [TEAM] | 3h | C-02 | M2 | [ ] |
| C-06 | `StopBanner` built from rule templates and recorded inputs (A-16): colour, icon and text | [TEAM] | 1h | A-16, C-05 | M3 | [ ] |
| C-07 | Packet console: `RevokeButton` (hold to confirm), escalation countdown (amber) | [TEAM] | 1.5h | C-04, A-24 | M3 | [ ] |
| C-08 | `LogTimeline` screen | [TEAM] | 1.5h | A-18, C-02 | M3 | [ ] |
| C-09 | `apps/verifier` offline page with `VerifierPanel`: paste log, public keys, head checkpoint; pass or first failing seq; Tamper button flips one byte of a copy; no network calls (T-V1) | [TEAM] | 2h | A-19 | M3 | [ ] |
| C-10 | Evidence screen (04 §Screens): `EvidenceCharts` from harness results (B0, B1, B2), manual-route table (E3), OBSERVED captures (E5), the one real decline | [TEAM] | 2.5h | D-11, D-12 | M4 | [ ] |
| C-11 | Presenter mode: big-screen layout | [TEAM] | 1h | C-05 | M4 | [ ] |
| C-12 | zh-HK second-line copy, reviewed by a zh-HK reader | [TEAM] | 0.75h | C-03 | M4 | [ ] |
| C-13 | Accessibility and mobile-first pass: contrast, 44px touch targets, reduced motion | [TEAM] | 1.5h | C-11 | M4 | [ ] |
| C-14 | Label audit: SIMULATED visible wherever the rail appears; no HKT, Tap & Go or Mastercard logos or lookalikes | [TEAM] | 0.5h | C-13 | M4 | [ ] |

### Lane D: evidence + pitch
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| D-01 | Ask organisers: prize structure, judging weights, pitch length, pre-existing code rule, HKT sandbox and mentors, track counts [F14-F17]; write answers into the register rows | [TEAM] | 0.5h | none | M1 | [ ] |
| D-02 | Ask an HKT mentor whether a delegate SUC API is planned (kill test 3) [F17] | [TEAM] | 0.25h | none | M1 | [ ] |
| D-03 | Real-card decline test (kill test 1), protocol in 05 §Real-card test: the holder types their own card on a store from the D-04 list, limit set below the total; the aim is a decline, never a payment [F2.cancel]; record decline code and timestamp in `data/real-card-test.md`; never log PAN or CVV (I8) [F2.secrecy]; void the card after | [TEAM] | 1.5h | none | M2 | [ ] |
| D-04 | Shop probe (kill test 2): 10 stores, 4 checks each, read-only, human-paced, no bypassing of challenges; hostile rule fixed before the first visit [F81]; log in `data/shop-probe.md` [F39] | [TEAM] | 2h | none | M2 | [ ] |
| D-05 | Capture 5 real listings with screenshot and timestamp in `data/capture-sheet.md` [F40] | [TEAM] | 1h | none | M1 | [ ] |
| D-06 | Re-capture F1-F3 values (card, T&C, charges) with screenshot and timestamp; needs a Plus/Pro holder | [TEAM] | 1h | none | M2 | [ ] |
| D-07 | Scameter: no terms on automated use found and the Important Notice limits reproduction [F6]; manual captures only (D9), no Bulk Search; log redacted, timestamped lookups | [TEAM] | 1h | none | M2 | [ ] |
| D-08 | Harness generator: seeded scenarios, 12 categories [F37] each with legitimate controls, deterministic by seed; imports core's engine and rail-sim, never reimplements them | [TEAM] | 2h | A-15, A-20 | M3 | [ ] |
| D-09 | Baselines B0 (prompt-only limit), B1 (plus judge), B2 (full pipeline); one recorded planner output per scenario feeds all three | [TEAM] | 1.5h | D-08, B-05 | M3 | [ ] |
| D-10 | Metrics: overspend rate, wrong-merchant rate, false-block rate, judge false-allow on the injection set, p50 and p95 latency, cost per decision; each MEASURED(n) with seed and commit (T-H3) | [TEAM] | 1.5h | D-09 | M3 | [ ] |
| D-11 | Run at least 100 scenarios (target 150-200) [F37]; write results to `data/results/`; tune thresholds [F36] on the tuning part of the injection set; freeze at M5 [F41] | [TEAM] | 1.5h | D-10, B-11 | M3 | [ ] |
| D-12 | Route M stopwatch (05 §Manual-route comparison): the holder by hand, steps counted by a second person from a recording; at least 3 timed runs, 2 runners [F80]; no timed run completes a payment | [TEAM] | 1h | none | M3 | [ ] |
| D-13 | Evidence map E1-E5 to artefacts (05 §Evidence map); loss rule v0 (01 §Loss rule v0) | [TEAM] | 1h | D-11 | M4 | [ ] |
| D-14 | HKT ask page (09): observed gaps, proposed API; label "proposal, not an HKT commitment" | [TEAM] | 1.5h | D-03, D-06 | M4 | [ ] |
| D-15 | Pitch deck and hard Q&A per 07, with the honesty slide | [TEAM] | 3h | D-13 | M5 | [ ] |
| D-16 | Demo script (06): pre-demo checklist, fallbacks, backup recording plan; run X-14 before each rehearsal | [TEAM] | 1h | X-11 | M5 | [ ] |
| D-17 | Four timed rehearsals [F41]; log time per run and a fix list | [TEAM] | 3h | D-15, D-16 | M6 | [ ] |
| D-18 | Backup video, labelled recorded | [TEAM] | 1.5h | D-17 | M6 | [ ] |
| D-19 | Stretch, cut third (D9): reconcile the agent log with Tap & Go history | [TEAM] | 2h | D-03 | M4 | [ ] |
| D-20 | Register hygiene: every touched row is OBSERVED(date) or still READ-BY-CLAUDE; fill "Used in" | [TEAM] | 0.5h | D-06 | M5 | [ ] |
| D-21 | Route A stopwatch after the freeze: same measures as D-12, A's issue is SIMULATED; feeds the E3 chart (DM8) | [TEAM] | 1h | D-12, X-11 | M5 | [ ] |
