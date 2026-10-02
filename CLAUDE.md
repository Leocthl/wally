# Lai See Agent (利是 Agent)

- Sealed-budget mandate engine for AI shopping agents: only a cart the policy engine approves gets a single-use token (rail SIMULATED).

## Status
- **Event**: HacKU 2026, FinTech track "Give a Machine a Wallet", 2026-10-02 to 2026-10-04 [F13]; HKT problem statement declared [F13, F17]. Not affiliated with HKT, Tap & Go or Mastercard.
- **Phase**: build from H0 [F41] on contract V2: local-first, booth first (D12, D13). Engine, crypto, log, rail, judge, planner, harness and the mock-backed UI are merged; orchestrator, API server and booth wiring are in progress.
- **Local-first, Laya only**: the demo runs with no network and no API key. Laya, a third-party open-source typed model, runs on this Mac [F11c] as the judge and drives the planner: a decision loop in a deterministic harness, with `replay` as fallback. Claude and hosted Jev are optional backends nothing depends on.
- **Freeze**: no commits after Sun 2026-10-04 13:00 HKT [F16]. The repo is public by then and submitted with deck, video and declaration [F18]. Procedure: 03 §Freeze.
- **Open**: assumptions in `docs/00-context.md`; unknowns and re-captures in the register's VERIFY queue.
- **Sources of truth**: numbers `docs/facts-register.md` · IDs `docs/00-context.md` · data shapes `schemas/` · design tokens `docs/04-design-language.md` · backlog `TASKS.md`.
- **Public-safe repo**: public sources only, no secrets, no real person's identifiers, no logos. Third-party code and models credited in `THIRD_PARTY.md` and README Credits [F16].

## Invariants (each has a test, T-I1..T-I8)
- **I1** no mint without APPROVE from the policy engine
- **I2** minted limit == approved cart total (<= min(remaining, rail ceiling [F1]))
- **I3** judge output can only change APPROVE to DENY or ESCALATE, never the reverse
- **I4** planner has no credentials and no payment tool
- **I5** any error, timeout or unknown ⇒ DENY or ESCALATE (fail closed)
- **I6** revoked or expired mandate never mints
- **I7** every decision has exactly one signed log entry; the chain verifies offline
- **I8** no PAN/CVV in logs, files or prompts
- **Explanations** render from rule templates + recorded inputs, never LLM prose.

## Repo map
```
CLAUDE.md  README.md  TASKS.md  THIRD_PARTY.md  .env.example
docs/      00-context 01-product-brief 02-architecture 03-implementation-plan 04-design-language
           05-evidence-plan 06-demo-script 07-pitch 08-risk-register 09-hkt-delegation-api-ask
           10-test-plan lane-prompts facts-register adr/
schemas/   MandateCredential Mandate Cart Decision LogEntry CardRecord PacketState (JSON Schema, source of truth)
scripts/   docs-check.py trace-check.py
data/      capture-sheet shop-probe real-card-test (templates), fixtures/, raw/ (gitignored)
apps/web apps/verifier                      lane C
packages/core packages/rail-sim             lane A
packages/agent                              lane B
services/laya                               lane B   (local Laya server, weights gitignored)
packages/harness                            lane D
```

## Local services
- **Laya**: `services/laya/` (setup.sh, serve.sh, stop.sh, smoke.mjs) on 127.0.0.1:8808, checkpoint `typed-decisions` [F11c]. Down ⇒ judge status ERROR ⇒ ESCALATE `R10.unavailable` (I5).
- **Planner**: no server of its own; the `rule` backend runs the Laya decision loop (02 §14). `PLANNER_PROVIDER=replay` is the booth fallback and the CI default.
- **Bound to 127.0.0.1 only**; listing text sent to Laya never leaves the Mac. Env names: 02 §15.

## Commands
- **Work today** (stdlib Python): `python3 scripts/docs-check.py` (caps, unknown F-IDs, numbers without an ID, PAN-like runs, style; `--update-register` refreshes the Used-in column) and `python3 scripts/trace-check.py` (SR/E traceability, ID coverage, links).
- **Workspace** (pnpm): `pnpm install`, `pnpm typecheck`, `pnpm lint` (includes the import-boundary tests), `pnpm test`, `pnpm build`, `pnpm gen:types` (schemas to types; commit the output), `pnpm docs:check`. API: `pnpm --filter @laisee/web api` (127.0.0.1:8787).
- **Laya judge** (local, loopback only): `services/laya/setup.sh` once, `services/laya/serve.sh`, `services/laya/stop.sh`, `node services/laya/smoke.mjs`; warm it up after every start (first call is slow).
- **Also working**: `pnpm coverage` (core line gate [F44]), `pnpm keys:gen` (throwaway demo keys into gitignored `.keys/`), `pnpm verify-log <log> <public-keys> [checkpoint]`, `pnpm harness -- --seed 7 --n 150 --judge live|recorded`, `pnpm --filter @laisee/agent judge:fit`.
- **TBD until their lanes land**: `pnpm demo:reset`, the API server and the one-command booth start.

## Working agreements
- **Parallel by default**: one Claude Code session per lane in its own git worktree (`.worktrees/<name>`) on branch `lane/<name>`, committing there; X merges at gates; never two sessions in one package.
- **Contracts first**: change `schemas/` or a port in `docs/02-architecture.md` by PR and tell every lane. Never fork a shape locally.
- **Policy engine tests first**: failing test (T-I*, T-S*), then code. `packages/core` coverage target [F44].
- **No new number without a register ID.** Docs cite `[F#]`; code reads thresholds from config that cites the ID.
- **Provenance tags**: OBSERVED(date) / SIMULATED / MEASURED(n) / ASSUMED. The UI shows a chip beside every number. A rate, fee or points value nobody observed and timestamped is a fabrication.
- **Label the rail SIMULATED** wherever it appears. Say "not found", never "does not have", about HKT or others.
- **Fail closed** on every error path. Judge output can tighten a decision, never loosen it.
- **Planner isolation**: planner code imports nothing from rail-sim or signing code and holds no card material.
- **Secrets**: `.env`, `.keys/`, `data/raw/`, model weights never committed. No PAN/CVV in code, fixtures, logs, prompts or screenshots. A human types the card in the real-card test.
- **Credits**: a new dependency or model enters `THIRD_PARTY.md` in the same commit [F16]. The team must be able to explain every core module (02).
- **Code style**: TypeScript strict, immutable updates (return new objects), money as integer minor units, validate at boundaries against `schemas/`, files under 400 lines typical and 800 max.
- **Commits**: `<type>: <description>` with type feat, fix, refactor, docs, test, chore, perf or ci. No attribution lines.

## Definition of done per lane
- **A policy + rail**: every rule R1-R12 unit-tested with tests written first; T-I1..T-I8, T-S1..T-S6, T-R1 green; mandate credential and log verify offline (T-V1); coverage of `packages/core` meets [F44]; no PAN or CVV anywhere (I8); rail outputs carry a SIMULATED label; `pnpm test` green.
- **B agent + judge**: planner can call only `propose_cart` (I4) and runs without any API key; the Laya/Jev adapter and the replay judge pass the JudgePort contract tests including timeout, error and truncated input ⇒ fail closed (I5); rotation averaging is on; shadow mode logs judge output with no effect; model version and latency logged; fixtures for S2 and S3 give the expected judge outputs; no secrets in the repo.
- **C UI + verifier**: screens seal, run, console, log + verifier, evidence, presenter and booth built to 04; the booth works with no network and no API key; every number wears a provenance chip; stop banners render from rule templates; verifier works offline and fails on tamper (T-V1); contrast and 44px touch targets pass; mobile-first view; reduced motion respected.
- **D evidence + pitch**: at least 100 seeded scenarios (target 150-200) [F37] run through B0, B1, B2 with MEASURED(n) results; captures logged in `data/capture-sheet.md`; real-card test and shop probe done or marked skipped with the reason; four timed rehearsals [F41]; submission package ready before the freeze: public repo, deck, 3-minute video, declaration [F18]; every touched register row is OBSERVED or still READ-BY-CLAUDE.
- **X cross-lane**: CI green (typecheck, lint, test, docs-check); T-E2E passes DM1-DM7; each gate M1-M5 recorded in TASKS.md; no lane merged red.

## Cut order and triggers [F41]
- **Cut first to last (D9)**: teen chain, screenshot intake (only if under 2 h), reconciliation, harness 200 → 100 [F37], Scameter → manual capture only. did:key and the credential stay: HKT's workshop centres on DID-VC [F19]. DM6 in the demo goes before any of these.
- **Optional by design, not cuts**: hosted Jev, claude planner. There is no LLM judge.
- **Triggers**: H2 Laya smoke fails ⇒ planner `replay` and recorded judge outputs, labelled; live judge calls ESCALATE · H6 no end-to-end stop ⇒ log signing to hash-chain only (credential proof stays) · H10 still failing ⇒ Track 4 contingency (D8) · H12 no real-card test ⇒ sim-only, say so.

## Doc style (team-facing md)
- **Point form**, bold keywords, no intro paragraph under a heading, no filler, at most one hint line per table, few examples, tables and checklists first.
- **No em dashes, no emoji**, no hype words; plain verbs. Must not read as AI-written.
- **Terms**: mandate, packet, seal, cart, decision, mint, stop, escalation, revoke, rail, planner, judge. No synonyms.
- **Length caps** (words outside code fences): 01 600 · 02 1,800 · 03 1,200 · 04 1,000 · 05 800 · 06 700 · 07 900 · 09 one page · 10 500 · ADR 15 lines · README 80 lines · this file 120 lines.

## Links
- Context, IDs, decisions: `docs/00-context.md` · numbers: `docs/facts-register.md`
- Product and demo: `docs/01-product-brief.md` · `docs/06-demo-script.md` · `docs/07-pitch.md`
- Build: `docs/02-architecture.md` · `docs/03-implementation-plan.md` · `docs/10-test-plan.md` · `TASKS.md` · `docs/lane-prompts.md`
- Look and evidence: `docs/04-design-language.md` · `docs/05-evidence-plan.md` · `docs/adr/`
- Risk and ask: `docs/08-risk-register.md` · `docs/09-hkt-delegation-api-ask.md` · credits: `THIRD_PARTY.md`
