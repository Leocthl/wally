# TASKS

## Top 10 do-first
1. **A-31, A-26, A-23 to A-25, A-28** Cart builder and orchestrator (lane e-orch), then X-10, X-14, A-35: API server, `demo:reset`, booth scenarios.
2. **C-09** Offline verifier page (lane e-verifier); **B-19, B-20** judge corpus split and threshold fit (lane e-tune).
3. **X-01** Create the remote and make the repo public; needs the team's explicit yes. Until then every tick means "merged to `main`, green locally"; CI runs once the remote exists.
4. **D-09 to D-11, D-22, D-23** Harness on the real components, then the live n=150 runs after the judge is tuned and the orchestrator lands.
5. **C-15, C-16, C-17** Booth screen wired to the real API (the mock stays for tests).
6. **D-03, D-04** Kill tests, human only: real-card decline (a human types the card [F1]) and shop probe [F39].
7. **X-11, X-17** T-E2E and the booth smoke with network off and Laya stopped.
8. **D-15, D-16, D-18, D-25** Deck, demo script run, 3-minute video, submission package; form opens Sat, deadline Sun 13:00 HKT [F18].
9. **A-27, A-29** Property tests T-I1 to T-I8 across the pipeline; coverage gate is wired (F44).
10. **S-audit** Security and spec-conformance review of crypto, log, rail and judge before the repo goes public.

## Backlog
- Milestones [F41]: M1 H6 (Sat 02:45), M2 H12 (Sat 08:45), M3 H20 (Sat 16:45), M4 H28 (Sun 00:45), M5 H34 (Sun 06:45, feature freeze), M6 Sun 07:00-12:00 (rehearsals, video, submission). Hard freeze Sun 13:00 HKT: no repo changes after it [F16]. Est is wall-clock hours with a Claude Code session on the task. Owner `[TEAM]` is a name to fill in. Tick Done when merged to `main` with CI green.

### Lane X: cross-lane
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| X-01 | Create repo and remote; protect `main`; one branch or git worktree per lane (A, B, C, D, X) | foundation agent | 0.5h | none | M1 | [ ] |
| X-02 | Scaffold pnpm workspace per 02 §Stack and repo layout: `apps/web`, `apps/verifier`, `packages/core`, `rail-sim`, `agent`, `harness`, `schemas`, `data`; tsconfig base, vitest, fast-check, eslint; scripts `typecheck`, `lint`, `test`, `docs-check` | foundation agent | 1h | X-01 | M1 | [x] |
| X-03 | CI on every push: typecheck, lint, test, docs-check. Lint carries import-boundary rules: `agent` imports no signing or rail-sim (I4), `harness` reuses core, `verifier` imports `verifyChain`, `verifyCredential` and types only. Coverage gate for `packages/core` [F44] | foundation agent | 1h | X-02, X-04 | M1 | [x] |
| X-04 | docs-check script (start from `scripts/docs-check.py`), tests first on good and bad samples: fail on unknown F-IDs, PAN-like digit runs (with or without spaces or hyphens), secret patterns; scan docs, data, schemas, code | foundation agent | 1.5h | X-02 | M1 | [x] |
| X-05 | Schemas to types per 02 §Stack and repo layout: generated types and one ajv validator per schema (MandateCredential, Mandate, Cart, Decision, LogEntry, CardRecord, PacketState); validate at every boundary | foundation agent | 1h | X-02 | M1 | [x] |
| X-06 | Ports in `core` (02 §Interfaces): `JudgePort`, `RailPort`, `LogStore`, `Clock`, `PlannerPort`, `Signer`. Fakes so M1 runs end to end: judge allows, rail mints and declines above the limit, merchant is honest | foundation agent | 1h | X-05 | M1 | [x] |
| X-07 | Fixtures in `data/fixtures/`: mandate M0, packet [F20], attempts [F21-F23], flagged seller, injected listing; each labelled SIMULATED, no real person's identifiers | foundation agent | 1.5h | X-05 | M1 | [x] |
| X-08 | `.env.example` listing the names in 02 §Env config; `.gitignore` for `.env`, `.keys/`, `.data/`, `data/raw/`, model weights; secret patterns in docs-check | foundation agent | 0.25h | X-02 | M1 | [x] |
| X-09 | Lock scope and roles; write owners into this file; contract-change rule (a schema or port change needs the X owner and a channel note) | [TEAM] | 0.5h | none | M1 | [ ] |
| X-10 | Integrate: compose orchestrator, judge adapters and rail-sim in `apps/web`; merge lane branches at each gate | [TEAM] | 2h | A-26, B-14, B-15, C-02 | M2 | [ ] |
| X-11 | T-E2E: scripted DM1-DM7 on the SIMULATED rail; asserts SIMULATED chips and verifier failure after tamper; includes the booth smoke (X-17) | [TEAM] | 3h | X-10, C-09, X-14 | M4 | [ ] |
| X-12 | Fill CLAUDE.md commands (typecheck, lint, test, docs-check, keys:gen, demo:reset, Laya service) and README quickstart once the scaffold exists | [TEAM] | 0.25h | X-03 | M1 | [ ] |
| X-13 | Gate keeper: run each gate and trigger check (H2, H6, H10, H12 [F41]); record pass or miss with time in this file | [TEAM] | 1h | none | M1-M5 | [ ] |
| X-14 | `pnpm demo:reset` per 06 §Reset: packet to HK$800 [F20], zero cards, log and escalations cleared, fixtures reloaded, demo keys regenerated, PresenterBar at step 0 in SIMULATED; booth Reset calls the same path; never touches `data/` captures | [TEAM] | 1h | A-26, X-07, C-02 | M4 | [ ] |
| X-15 | Lane worktrees: `git worktree add .worktrees/<name> -b lane/<name>` for a, b, c, d; each lane commits on its branch; merge to `main` at gates in the order X, A, B, C, D | [TEAM] | 0.25h | X-01 | M1 | [x] |
| X-16 | Integrate V2: `SystemOneJudge` (laya default), planner backend (`rule` default, `replay` fallback), credential seal and rail token features wired in `apps/web`; env names per 02 §Env config; a stopped Laya server falls back without a crash | [TEAM] | 1.5h | X-10, A-32, A-33, B-14, B-15 | M3 | [ ] |
| X-17 | Booth smoke inside T-E2E: every scenario button (04 §Booth) runs with network off and no API key; Laya stopped gives judge ERROR, then ESCALATE `R10.unavailable`; Reset returns to step 0 | [TEAM] | 1.5h | X-11, C-16 | M4 | [ ] |
| X-18 | Freeze guard: pre-push hook and CI check that refuse pushes after Sun 13:00 HKT [F16]; run with the 03 §Freeze checklist (D-26) | [TEAM] | 0.5h | X-03 | M5 | [ ] |
| X-19 | Credits keeper: every dependency or model added appears in `THIRD_PARTY.md` and README Credits with its licence [F16]; CI lists packages missing from it | [TEAM] | 0.5h | X-02 | M5 | [ ] |

### Lane A: policy + rail
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| A-01 | Stub engine: `decide()` returns DENY citing a rule ID; in-memory `LogStore`; fake `Clock` | foundation agent | 0.5h | X-06 | M1 | [x] |
| A-02 | Packet math (U1), `foldPacket`: remaining = sealed amount less committed and settled; commit on mint, release on `VOIDED` or `EXPIRED`, settle on `AUTHORISED` with the actual amount; fold from the log; integer minor units. Tests first: never negative, release restores | [TEAM] | 1.5h | A-01 | M1 | [x] |
| A-03 | R1 credential proof valid: `verifyCredential` (A-32), issuer = delegator did:key. Tests first: tampered subject, wrong key, wrong cryptosuite | [TEAM] | 0.25h | A-01, A-32 | M1 | [x] |
| A-04 | R2 not revoked, not expired (`R2.revoked`, `R2.expired`). Tests first | [TEAM] | 0.25h | A-01 | M1 | [x] |
| A-05 | R3 total <= remaining, total includes shipping, fees, FX (`R3.over_remaining`). Tests first, including the cart over HK$541 left [F22] | [TEAM] | 0.25h | A-02 | M1 | [x] |
| A-06 | R4 per-purchase cap, fixed or adaptive share of remaining; above `ask_above` returns ESCALATE (`R4.over_cap`, `R4.ask_above`). Tests first | [TEAM] | 0.5h | A-02 | M1 | [x] |
| A-07 | R5 total <= rail ceiling [F1]. Tests first | [TEAM] | 0.25h | A-01 | M1 | [x] |
| A-08 | R6 merchant and category inside the mandate. Tests first | [TEAM] | 0.25h | A-01 | M1 | [x] |
| A-09 | R7 velocity [F32]: rolling window read from the log, injected `Clock` (`R7.velocity`). Tests first | [TEAM] | 0.5h | A-01 | M2 | [x] |
| A-10 | R8 active cards below the rail maximum [F1]. Tests first | [TEAM] | 0.25h | A-01 | M2 | [x] |
| A-11 | R9 seller check: Scameter state and seller identifiers; a capture older than the max age [F52] counts as unverified; flagged DENY, unverified ESCALATE, "no record" is not "safe" [F6] (`R9.flagged`, `R9.unverified`). Tests first | [TEAM] | 0.75h | A-01, B-09 | M2 | [x] |
| A-12 | R10 judge thresholds [F36, F50] read from config; probabilities only; gate composed from `scope_fit`, `injection_risk`, `seller_risk`; the judge can only tighten (I3) (`R10.injection`, `R10.seller_risk`, `R10.scope`, `R10.unavailable`). Tests first | [TEAM] | 0.75h | A-01, B-08 | M2 | [x] |
| A-13 | R11 unanswered escalation after the window [F31] returns DENY (`R11.expired`). Tests first | [TEAM] | 0.5h | A-01 | M2 | [x] |
| A-14 | R12 price drift voids the approval; new cart, new decision (`R12.price_drift`). Tests first | [TEAM] | 0.5h | A-01 | M2 | [x] |
| A-15 | `engine.decide`: pure; runs R1-R12 as they land; hard rules R1-R8 and R12 cannot be overridden by an escalation resolution; every DENY or ESCALATE cites a rule ID | [TEAM] | 1.5h | A-03 to A-08 | M1 | [x] |
| A-16 | Explanation templates (02 §Explanation templates): one pure render function per template ID (`R2.revoked` to `R12.price_drift`) from recorded inputs; golden tests; no LLM prose | [TEAM] | 1h | A-15 | M2 | [x] |
| A-17 | Crypto per 02 §Crypto: Ed25519 sign and verify, JCS canonical JSON, SHA-256, base58btc, did:key encode and decode (kept: D9 no longer cuts it); `pnpm keys:gen` writes throwaway demo keys to gitignored `.keys/`, never committed | [TEAM] | 1h | X-02 | M1 | [x] |
| A-18 | Log: append-only `LogStore` (JSONL); exactly one signed entry per decision (I7), written before any side effect; head checkpoint | [TEAM] | 1h | A-17, X-05 | M1 | [x] |
| A-19 | `verifyChain(entries, publicKeys, headCheckpoint)` returns pass or first failing seq. Tests first: byte flip, truncation, reorder (T-V1) | [TEAM] | 1.5h | A-18 | M1 | [x] |
| A-20 | Rail-sim (SIMULATED) per 02 §Rail simulator: `mint`, `authorise`, `void`, `expireDue` with F1 semantics [F1]; masked last4 only (I8); decline codes; SIMULATED label on every output. Tests first (T-R1) | [TEAM] | 2h | X-06 | M2 | [x] |
| A-21 | Rail-sim calibration (02 §Rail simulator): copy the decline wording, where it shows, submit-to-decline time and hold behaviour from D-03; no D-03 by H12 [F41] means tag sim-only | [TEAM] | 1h | A-20, D-03 | M2 | [ ] |
| A-22 | Executor in `core` (deterministic, never the planner) and merchant stub in `rail-sim` with modes `honest`, `overshoot`, `drift`, `preauth` (02 §Rail simulator; `timeout`, `wrong_merchant` in A-34): re-quote at checkout (R12), limit-held decline on overshoot (DM2) | [TEAM] | 1.5h | X-06 | M1 | [x] |
| A-23 | Escalation lifecycle: OPEN, APPROVED, DENIED, EXPIRED; timer on `Clock`; hard rules stay un-overridable; T-S5 | [TEAM] | 1h | A-13, A-15 | M3 | [ ] |
| A-24 | Revoke: signed revoke, `MANDATE_REVOKED`, void unused cards, `CARD_EVENT(VOIDED)`; revoke-versus-mint race tests; T-S4 | [TEAM] | 1h | A-18, A-20 | M3 | [ ] |
| A-25 | Expiry and velocity scenarios: `PACKET_EXPIRED` entry, card `EXPIRED` event driven by `Clock`; T-S6 | [TEAM] | 0.5h | A-09, A-18, A-20 | M3 | [ ] |
| A-26 | Orchestrator per pipeline contract v0: per-packet queue serialising decide, append, mint, revoke and checkout; judge in parallel with preflight; timers; head checkpoint | [TEAM] | 2h | A-15, A-18, A-22, A-31, A-32 | M1 | [ ] |
| A-27 | Property tests T-I1 to T-I8 (fast-check): write red against A-01, turn green as rules land | [TEAM] | 1.5h | A-15, A-26 | M3 | [ ] |
| A-28 | Scenario tests T-S1 to T-S3 (the live stops) on the merchant stub and rail-sim | [TEAM] | 1h | A-20, A-22, A-26 | M2 | [ ] |
| A-29 | Coverage gate for `packages/core` [F44]; close gaps | [TEAM] | 1h | A-27 | M3 | [ ] |
| A-30 | Stretch, cut first (D9): teen chain, parent to teen to agent, caps compose | [TEAM] | 3h | A-26 | M4 | [ ] |
| A-31 | Cart builder in `core` (02 §Components): `propose_cart` input to Cart, priced from the listing record incl. shipping, fees, FX [F3]; the planner sets no money fields | [TEAM] | 1.5h | X-05, X-07 | M1 | [ ] |
| A-32 | AgentDelegationCredential (02 §Crypto, ADR-0007): `signCredential`, `verifyCredential` (eddsa-jcs-2022: SHA-256(JCS(proof config)) then SHA-256(JCS(document)), Ed25519, `z` + base58btc), did:key encode and decode, `mandateFromCredential`; golden vectors computed by this code and frozen in tests. Tests first: tampered subject, wrong issuer key, wrong cryptosuite, `proofValue` without `z` | [TEAM] | 2h | A-17, X-05 | M1 | [x] |
| A-33 | Rail token features (SIMULATED): optional `merchant_lock` and `purpose` on mint; decline `MERCHANT_MISMATCH`; mint idempotent by `decision.id` (same CardRecord, no second card); a replay after the charge declines `CARD_USED` (DM2). Tests first | [TEAM] | 1.5h | A-20 | M2 | [x] |
| A-34 | Merchant stub modes `timeout` and `wrong_merchant`; the executor retries `authorise` with the same idempotency key and the rail records one charge (failure injection, no duplicate [F19]). Tests first | [TEAM] | 1.5h | A-22, A-33 | M2 | [x] |
| A-35 | Orchestrator API for booth mode: M0 sealed on load, run a scenario by ID (04 §Booth), free-text listing in, alternatives after an R3 or R4 stop (`planner.alternatives`, result goes through judge and engine again), reset; SSE events per stage | [TEAM] | 1.5h | A-26, B-18 | M3 | [ ] |

### Lane B: agent + judge
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| B-01 | Laya smoke test: `services/laya/serve.sh`, then `smoke.mjs` on 127.0.0.1:8808 [F11c]; one request with the four judge questions; response shape into `services/laya/FINDINGS.md`, latency as MEASURED(n) on this Mac. Hosted Jev smoke [F11b] only if a key appears | [TEAM] | 0.5h | none | M1 | [x] |
| B-02 | Optional `claude` planner backend, only if a key ever appears (nothing depends on it): read the claude-api skill first; one strict tool `propose_cart`, `tool_choice` auto [F62]; `stop_reason` `refusal` or `max_tokens` fails closed (I5); timeout [F33] | [TEAM] | 1.5h | B-15 | M4 | [ ] |
| B-03 | Listing ingest: structured record (title, price, shipping, seller) for the planner; the description text goes only to the judge, in a delimited block; no PAN or CVV anywhere (I8); CI uses `replay`, no live calls | [TEAM] | 1h | B-15, X-07 | M1 | [x] |
| B-04 | `JudgePort` contract tests shared by laya, jev and replay, tests first, on a mock HTTP server: timeout, error, malformed output, unknown option, missing rotation, `usage.truncated` all fail closed (I5) | [TEAM] | 1h | X-06 | M1 | [x] |
| B-05 | Dropped: llm fallback judge (there is no LLM judge; the fallback is `replay`, B-21) | none | 0h | none | none | n/a |
| B-06 | Hosted Jev profile (optional): `SystemOneJudge` with `JEV_BASE_URL`, `TYPESAFE_API_KEY`, `JEV_MODEL` pinned [F11b]; only if a key appears; timeout F34, retries 0 | [TEAM] | 0.5h | B-14 | M4 | [ ] |
| B-07 | Shadow mode via `JUDGE_MODE`: judge output logged with no effect on the decision; `enforce` for the demo | [TEAM] | 0.75h | B-14 | M2 | [x] |
| B-08 | Judge config: thresholds [F36, F50], `JUDGE_PROVIDER` (`laya`, `jev` or `replay`), `JUDGE_MODE`, `LAYA_BASE_URL`, `LAYA_MODEL`, timeouts; no values in code | [TEAM] | 0.25h | X-06 | M1 | [x] |
| B-09 | Seller-check input: Scameter capture loader, manual capture only (human-paced, ToS respected [F6]); states flagged, unverified, no record; capture age [F52] | [TEAM] | 1h | X-05 | M2 | [ ] |
| B-10 | Golden judge outputs for the S2 and S3 fixtures, recorded from Laya | [TEAM] | 0.75h | X-07, B-14 | M2 | [ ] |
| B-11 | Injection corpus: description, review and image-alt text variants, incl. negation and booth-style free text, for judge tests and the harness | [TEAM] | 1h | B-14 | M3 | [ ] |
| B-12 | Latency and cost logging per call; MEASURED only [F26], no vendor figure reported as ours; local Laya logs no per-call charge, noted as local compute | [TEAM] | 0.75h | B-14 | M2 | [ ] |
| B-13 | Stretch, cut second (D9): screenshot intake to a draft cart, only if it fits the D9 time-box | [TEAM] | 2h | B-03 | M4 | [ ] |
| B-14 | `SystemOneJudge` (providers `laya`, `jev`; one wire protocol, 02 §Judge adapter): one POST `/v1/systemone` with the four questions and semantic labels (never yes/no); k option-order rotations averaged back to canonical order; engine reads probabilities only; always sends `model: typed-decisions`; `usage.truncated` returns ERROR with `input_truncated: true` (padding attack); timeout F34, retries 0; any failure returns TIMEOUT or ERROR, never throws (I5); warm-up call after start [F26]. Shape from `services/laya/FINDINGS.md`. Tests first on a mock server (B-04) | [TEAM] | 2h | B-01, B-04 | M2 | [x] |
| B-15 | Planner harness and backends: structured listing parser (title, variants, price, shipping, seller; never the description), cart building in code, quantity 1, no money fields; `replay` (recorded outputs in `data/fixtures/planner/`; CI and booth fallback); `PLANNER_PROVIDER` = `rule`, `replay` or `claude`; no API key. Tests first: same input, same output | [TEAM] | 1.5h | X-06, X-07 | M1 | [x] |
| B-16 | Dropped: local generative planner client (the stack is Laya only) | none | 0h | none | none | n/a |
| B-17 | Dropped: planner server and model download scripts (the stack is Laya only) | none | 0h | none | none | n/a |
| B-18 | Laya decision loop (02 §Planner): state = request, mandate summary, remaining budget, structured candidates, last stop; typed decisions item, variant, next action (`propose`, `replan_cheaper`, `ask_shopper`, `give_up`), rotation-averaged, logged with probabilities and margin; a small top-two margin abstains (ask the shopper); code executes actions; step cap and margin in config; trace stored with the cart proposal; `alternatives` = `replan_cheaper` after R3 or R4. Tests first on a mock server | [TEAM] | 1.5h | B-14, B-15 | M2 | [x] |
| B-19 | Judge corpora for `scope_fit`, `seller_risk` and `escalate_or_proceed`, with negation and option-order variants (B-11 holds injection); SIMULATED; tuning and held-out splits fixed before any tuning | [TEAM] | 1h | B-11 | M3 | [ ] |
| B-20 | Threshold-fit script: fit the typed profile [F36, F50] for Laya on the tuning split (over-confident as shipped [F11c]); held-out results as MEASURED(n); writes config with register IDs; freeze at M5 [F41] | [TEAM] | 1.5h | B-14, B-19 | M4 | [ ] |
| B-21 | Replay judge (provider `replay`): recorded JudgeRecords keyed by input hash for CI and the booth fallback, labelled recorded; an unknown input returns ERROR (ESCALATE). Stretch: judge long descriptions in chunks, worst case wins | [TEAM] | 1h | B-04, B-10 | M2 | [x] |

### Lane C: UI + verifier
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| C-01 | Read 04. Tokens (light and dark), fonts, base styles; `ProvenanceChip` first, no bare numbers | [TEAM] | 1.5h | X-02 | M2 | [ ] |
| C-02 | App shell and thin Node API with SSE live trace in `apps/web`; `PresenterBar` (step, reset, SIMULATED/REAL toggle per 06; REAL stays disabled until D-03 lands); runs on the stub engine until A-26 | [TEAM] | 1.5h | C-01, A-01 | M2 | [ ] |
| C-03 | Seal screen: `MandateEditor`, sentence to compiled rule chips side by side, editable, Seal | [TEAM] | 2.5h | C-02 | M2 | [ ] |
| C-04 | `PacketMeter` and `CardTicket` (masked last4, limit, TTL, state, merchant lock, purpose) | [TEAM] | 1.5h | C-01 | M2 | [ ] |
| C-05 | Run screen: live trace planner, judge, engine, rail; `CartCard`; `DecisionCard` (rule ID, inputs, comparator, judge probabilities, outcome) | [TEAM] | 3h | C-02 | M2 | [ ] |
| C-06 | `StopBanner` built from rule templates and recorded inputs (A-16): colour, icon and text | [TEAM] | 1h | A-16, C-05 | M3 | [ ] |
| C-07 | Packet console: `RevokeButton` (hold to confirm), escalation countdown (amber) | [TEAM] | 1.5h | C-04, A-24 | M3 | [ ] |
| C-08 | `LogTimeline` screen | [TEAM] | 1.5h | A-18, C-02 | M3 | [ ] |
| C-09 | `apps/verifier` offline page with `VerifierPanel`: paste log, public keys, head checkpoint; pass or first failing seq; Tamper button flips one byte of a copy; no network calls (T-V1) | [TEAM] | 2h | A-19 | M3 | [ ] |
| C-10 | Evidence screen (04 §Screens): `EvidenceCharts` from harness results (B0, B1, B2), manual-route table (E3), OBSERVED captures (E5), the one real decline | [TEAM] | 2.5h | D-11, D-12 | M4 | [ ] |
| C-11 | Presenter mode: big-screen layout; the finalist stage reuses the booth app | [TEAM] | 1h | C-05 | M4 | [ ] |
| C-12 | zh-HK second-line copy, reviewed by a zh-HK reader | [TEAM] | 0.75h | C-03 | M4 | [ ] |
| C-13 | Accessibility and mobile-first pass: contrast, 44px touch targets, reduced motion | [TEAM] | 1.5h | C-11 | M4 | [ ] |
| C-14 | Label audit: SIMULATED visible wherever the rail appears; no HKT, Tap & Go or Mastercard logos or lookalikes | [TEAM] | 0.5h | C-13 | M4 | [ ] |
| C-15 | Booth screen (04 §Booth): M0 sealed on load; `ScenarioPicker`; live trace planner, judge, engine, rail; log with Verify and Tamper; Reset; SIMULATED badge; EN + zh-HK; works with network off and no API key | [TEAM] | 3h | C-05, C-09 | M3 | [ ] |
| C-16 | `ScenarioPicker`: preset buttons (normal purchase, flagged seller, shipping overflow, injected listing, off-category item [F29], revoke, replay the card, wrong merchant, price drift, rail timeout), "Try to trick the agent" free-text box (sent as listing data to planner and judge), Reset | [TEAM] | 1.5h | C-02, A-35 | M3 | [ ] |
| C-17 | Budget-stop affordances: "See alternatives" (B-18 via A-35) and "Top up packet" (opens Seal for a new signed mandate); an escalation answer never overrides a hard rule | [TEAM] | 1h | C-06, A-35 | M4 | [ ] |
| C-18 | `CredentialPanel`: the sealed AgentDelegationCredential (issuer did:key, validity, rules, proof) with the R1 result; on Seal and Booth | [TEAM] | 1h | C-03, A-32 | M3 | [ ] |
| C-19 | Bilingual pass for booth strings, scenario labels and stop banners: zh-HK second line, read by a zh-HK reader | [TEAM] | 0.75h | C-12, C-16 | M4 | [ ] |
| C-20 | Kiosk polish: full screen on the booth laptop, idle reset, fonts bundled offline, no dead ends, every error state recovers through Reset | [TEAM] | 1h | C-15 | M4 | [ ] |

### Lane D: evidence + pitch
| ID | Task | Owner | Est | Deps | Milestone | Done |
|---|---|---|---|---|---|---|
| D-01 | Ask organisers what the pack leaves open: HKT sandbox, API or mentors [F17], booth power and network, submission form fields [F18]; write answers into the register rows | [TEAM] | 0.5h | none | M1 | [ ] |
| D-02 | Ask an HKT mentor whether a delegate SUC API is planned (kill test 3) [F17] | [TEAM] | 0.25h | none | M1 | [ ] |
| D-03 | Real-card decline test (kill test 1), protocol in 05 §Real-card test: the holder types their own card on a store from the D-04 list, limit set below the total; the aim is a decline, never a payment [F2.cancel]; record decline code and timestamp in `data/real-card-test.md`; never log PAN or CVV (I8) [F2.secrecy]; void the card after | [TEAM] | 1.5h | none | M2 | [ ] |
| D-04 | Shop probe (kill test 2): 10 stores, 4 checks each, read-only, human-paced, no bypassing of challenges; hostile rule fixed before the first visit [F81]; log in `data/shop-probe.md` [F39] | [TEAM] | 2h | none | M2 | [ ] |
| D-05 | Capture 5 real listings with screenshot and timestamp in `data/capture-sheet.md` [F40] | [TEAM] | 1h | none | M1 | [ ] |
| D-06 | Re-capture F1-F3 values (card, T&C, charges) with screenshot and timestamp; needs a Plus/Pro holder | [TEAM] | 1h | none | M2 | [ ] |
| D-07 | Scameter: no terms on automated use found and the Important Notice limits reproduction [F6]; manual captures only (D9), no Bulk Search; log redacted, timestamped lookups | [TEAM] | 1h | none | M2 | [ ] |
| D-08 | Harness generator: seeded scenarios, 12 categories [F37] each with legitimate controls, deterministic by seed; imports core's engine and rail-sim, never reimplements them | [TEAM] | 2h | A-15, A-20 | M3 | [ ] |
| D-09 | Baseline runs B0, B1, B2 (definitions in D-28); one recorded planner output per scenario feeds all three; judge = Laya | [TEAM] | 1.5h | D-08, D-28, B-14 | M3 | [ ] |
| D-10 | Metrics: overspend rate, wrong-merchant rate, false-block rate, judge false-allow on the injection set, p50 and p95 latency, cost per decision; each MEASURED(n) with seed and commit (T-H3) | [TEAM] | 1.5h | D-09 | M3 | [ ] |
| D-11 | Run at least 100 scenarios (target 150-200) [F37]; write results to `data/results/`; thresholds come from B-20 on the tuning split; freeze at M5 [F41] | [TEAM] | 1.5h | D-10, B-11 | M3 | [ ] |
| D-12 | Route M stopwatch (05 §Manual-route comparison): the holder by hand, steps counted by a second person from a recording; at least 3 timed runs, 2 runners [F80]; no timed run completes a payment | [TEAM] | 1h | none | M3 | [ ] |
| D-13 | Evidence map E1-E5 to artefacts (05 §Evidence map); loss rule v0 (01 §Loss rule v0) | [TEAM] | 1h | D-11 | M4 | [ ] |
| D-14 | HKT ask page (09): observed gaps, proposed API, rail portability; label "proposal, not an HKT commitment" | [TEAM] | 1.5h | D-03, D-06 | M4 | [ ] |
| D-15 | Pitch deck and hard Q&A per 07, with the honesty slide | [TEAM] | 3h | D-13 | M5 | [ ] |
| D-16 | Demo script (06): booth script, hands-on station, finalist run, pre-demo checklist, fallbacks; run X-14 before each rehearsal | [TEAM] | 1h | X-11 | M5 | [ ] |
| D-17 | Four timed rehearsals [F41], booth clock [F45] and finalist clock [F42] both run; log time per run and a fix list | [TEAM] | 3h | D-15, D-16 | M6 | [ ] |
| D-18 | 3-minute prototype video [F18]: booth flow, SIMULATED badge visible, labelled recorded; also the stage backup | [TEAM] | 1.5h | D-17 | M6 | [ ] |
| D-19 | Stretch, cut third (D9): reconcile the agent log with Tap & Go history | [TEAM] | 2h | D-03 | M4 | [ ] |
| D-20 | Register hygiene: every touched row is OBSERVED(date) or still READ-BY-CLAUDE; fill "Used in" | [TEAM] | 0.5h | D-06 | M5 | [ ] |
| D-21 | Route A stopwatch after the freeze: same measures as D-12, A's issue is SIMULATED; feeds the E3 chart (DM8) | [TEAM] | 1h | D-12, X-11 | M5 | [ ] |
| D-22 | Harness on live Laya: judge-dependent categories through `SystemOneJudge` on the local server; latency MEASURED(n) on the booth Mac; cost recorded as local compute with no per-call charge | [TEAM] | 1.5h | D-09, B-14 | M3 | [ ] |
| D-23 | New harness categories (05 §Replay harness): `wrong_merchant`, `replay`, `rail_timeout` (one charge after retry), `judge_down` (ESCALATE) | [TEAM] | 1h | D-08, A-33, A-34 | M3 | [ ] |
| D-24 | Scoring map: HKT weights [F15] and HKT's evidence list [F19] to demo beats and artefacts (05 §Evidence map, 07 §Scoring map); one screenshot per evidence item for the deck | [TEAM] | 1h | D-13 | M4 | [ ] |
| D-25 | Submission package [F18]: deck (07), 3-minute video (D-18), public repo link checked logged out, declaration (HKT problem statement; Raccoon only if really used [F15]), poster optional; submitted before Sun 13:00 HKT | [TEAM] | 1.5h | D-15, D-18 | M6 | [ ] |
| D-26 | Freeze procedure (03 §Freeze): final commit before Sun 13:00 HKT [F16]; README Credits and `THIRD_PARTY.md` final; nothing pushed after | [TEAM] | 0.5h | D-25, X-18 | M6 | [ ] |
| D-27 | Booth kit: F45 clock card, "try to trick the agent" prompt card, QR to the public repo, rota that keeps one person at the booth through the exhibition [F14] | [TEAM] | 0.5h | D-16 | M5 | [ ] |
| D-28 | Baseline definitions in `packages/harness` (05 §Replay harness): B0 model-only gate (Laya answers `budget_fit` {within_budget, over_budget} plus the judge questions and is trusted; no arithmetic, no rail limit); B1 rules R1-R8 and R12 plus the rail limit, no judge (no R9, R10); B2 full pipeline. Tests first: B1 and B2 never mint above the limit | [TEAM] | 1h | D-08, B-14 | M3 | [ ] |
