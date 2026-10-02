# Wally

- Sealed-budget mandate engine for AI shopping agents: only a cart the policy engine approves gets a single-use token (rail SIMULATED).

## Status
- **Event**: HacKU 2026, FinTech track "Give a Machine a Wallet", 2026-10-02 to 2026-10-04 [F13]; HKT problem statement declared [F13, F17]. Not affiliated with HKT, Tap & Go or Mastercard.
- **Phase**: build from H0 [F41] on contract V2: local-first, booth first (D13, D15). Merged: engine, crypto, log, offline verifier, rail-sim, cart builder, executor, orchestrator, booth server, judge, planners, harness, PWA shell and on-device mode. Open: screens are being rebuilt (the Seal screen does not call `/api/compile` yet); see `TASKS.md`.
- **Local-first, two local models**: the demo runs with no network and no API key. Laya, a third-party open-source typed model, runs on this Mac as the judge [F11c]. Qwen3.5 under llama.cpp, also loopback only, is the planner and the sentence-to-rules compiler [F27]; it never gates a decision. There is no LLM judge. Planner providers: `rule` (Laya decision loop), `local` (Qwen), `replay` (recorded; CI default); the booth server's default `auto` picks `local` if Qwen answers at start, else `rule` if Laya does, else `replay`. The `claude` provider is removed; hosted Jev is optional.
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
scripts/   docs-check.py trace-check.py gen-types.mjs keys-gen.mjs verify-log.mjs demo-reset.mjs booth-check.mjs
data/      capture-sheet shop-probe real-card-test (templates), fixtures/, scenarios/, judge-corpus/, results/ (MEASURED), raw/ (gitignored)
apps/web apps/verifier                      lane C, M   (PWA, booth server, on-device mode; offline verifier page)
packages/core packages/rail-sim             lane A      (engine, crypto, log, verifier, cart, executor, orchestrator; SIMULATED rail)
packages/agent                              lane B      (planners, compiler, judge adapters, judge fit)
services/laya services/qwen                 lane B, M   (local model servers, weights gitignored)
packages/harness                            lane D
```

## Local services
- **Laya** (judge): `services/laya/` (setup.sh, serve.sh, stop.sh, smoke.mjs) on 127.0.0.1:8808, checkpoint `typed-decisions` [F11c]. Down ⇒ judge status ERROR ⇒ ESCALATE `R10.unavailable` (I5).
- **Qwen** (planner, compiler): `services/qwen/` (same four scripts) on 127.0.0.1:8809, Q4_K_M GGUF files pinned by commit and SHA-256 [F27, F63]; `QWEN_MODEL=4b` for the smaller model. Down ⇒ no proposal.
- **Planner**: no server of its own; `rule` runs the Laya decision loop (02 §14), `local` calls Qwen. `PLANNER_PROVIDER=replay` is the booth fallback and the CI default.
- **Bound to 127.0.0.1 only**; listing text and requests sent to either model never leave the Mac. Env names: 02 §15.

## Commands
- **Docs checks** (stdlib Python): `python3 scripts/docs-check.py` (caps, unknown F-IDs, numbers without an ID, PAN-like runs, style; `--update-register` refreshes the Used-in column) and `python3 scripts/trace-check.py` (SR/E traceability, ID coverage, links).
- **Workspace** (pnpm): `pnpm install`, `pnpm typecheck`, `pnpm lint` (includes the import-boundary tests), `pnpm test`, `pnpm coverage` (core line gate [F44]), `pnpm build`, `pnpm gen:types` (schemas to types and precompiled validators; commit the output; CI runs `node scripts/gen-types.mjs --check`), `pnpm docs:check`.
- **Booth**: `pnpm demo` (preflight, build if needed, API and UI on 127.0.0.1:8787), `pnpm demo:reset` (new demo keys, empty logs, back to the sealed packet), `pnpm keys:gen` (throwaway keys into gitignored `.keys/`), `pnpm verify-log <log> <public-keys> [checkpoint]`, `pnpm verifier` (builds the one-file offline page). Routes: `GET /api/health /info /snapshot /log /export /events` (SSE); `POST /api/seal /scenario/:id /propose /ask /alternatives /compile /revoke /escalation/answer /verify /tamper /restore /reset`.
- **Evidence**: `pnpm harness -- --seed 7 --n 150 --judge live|recorded [--record --provisional <reason>]`, `pnpm --filter @laisee/agent judge:fit`.
- **Local models** (loopback only): `services/laya/{setup,serve,stop}.sh` and `node services/laya/smoke.mjs`; `services/qwen/{setup,serve,stop}.sh` and `node services/qwen/smoke.mjs`. Warm both up after every start (the first call is slow).

## Known gaps (say them, never hide them)
- **Duplicate submission**: `submit` is idempotent by cart fingerprint, but booth buttons and the harness pass `allowRepeat`; the committed harness result predates the fix and still shows 2/84 through in B2 [F69].
- **Judge**: held-out, the F38 floor of 90% legitimate approved is not met at judge level, and the seller gate is inert [F36]; the end-to-end harness meets F38 [F69].
- **Keys**: the web API holds the delegator demo key; on-device mode makes every key in the page; a did:key cannot be rotated.
- **Log**: proves tamper, reorder, truncation (with the checkpoint), signatures, and consent and money for what is logged. Not omissions, a re-fold, or the shopper's intent.
- **Qwen**: evaluated on author-written cases with no held-out set [F68]; picked by `auto` when it answers; a later outage shows as no proposal.

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
- **B agent + judge**: planner can call only `propose_cart` (I4) and runs without any API key; the Laya/Jev adapter and the replay judge pass the JudgePort contract tests including timeout, error and truncated input ⇒ fail closed (I5); rotation averaging is on; shadow mode logs judge output with no effect; model version and latency logged; fixtures for S2 and S3 give the expected judge outputs; the `local` planner and the compiler never throw (no proposal, or the rule-based fallback); no secrets in the repo.
- **C UI + verifier**: screens seal, run, console, log + verifier, evidence, presenter and booth built to 04; the booth works with no network and no API key; every number wears a provenance chip; stop banners render from rule templates; verifier works offline and fails on tamper (T-V1); contrast and 44px touch targets pass; mobile-first view; reduced motion respected.
- **D evidence + pitch**: at least 100 seeded scenarios (target 150-200) [F37] run through B0, B1, B2 with MEASURED(n) results; captures logged in `data/capture-sheet.md`; real-card test and shop probe done or marked skipped with the reason; four timed rehearsals [F41]; submission package ready before the freeze: public repo, deck, 3-minute video, declaration [F18]; every touched register row is OBSERVED or still READ-BY-CLAUDE.
- **X cross-lane**: CI green (typecheck, lint, test, docs-check); T-E2E passes DM1-DM7; each gate M1-M5 recorded in TASKS.md; no lane merged red.

## Cut order and triggers [F41]
- **Cut first to last (D9)**: teen chain, screenshot intake (only if under 2 h), reconciliation, harness 200 → 100 [F37], Scameter → manual capture only. did:key and the credential stay: HKT's workshop centres on DID-VC [F19]. DM6 in the demo goes before any of these.
- **Optional by design, not cuts**: hosted Jev. The claude planner is removed. There is no LLM judge.
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
