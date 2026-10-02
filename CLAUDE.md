# Lai See Agent (利是 Agent)

Sealed-budget mandate engine for AI shopping agents: only a cart the policy engine approves gets a one-off card (rail SIMULATED).

## Status
- **Event**: HacKU 2026, FinTech track "Give a Machine a Wallet", 2026-10-02 to 2026-10-04 [F13]. Not affiliated with HKT, Tap & Go or Mastercard.
- **Phase**: planning docs done, build starts at H0 [F41].
- **Open**: assumptions in `docs/00-context.md`; unknowns and re-captures in the register's VERIFY queue.
- **Sources of truth**: numbers `docs/facts-register.md` · IDs `docs/00-context.md` · data shapes `schemas/` · design tokens `docs/04-design-language.md` · backlog `TASKS.md`.
- **Public-safe repo**: public sources only, no secrets, no real person's identifiers, no logos.

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
CLAUDE.md  README.md  TASKS.md  .env.example
docs/      00-context 01-product-brief 02-architecture 03-implementation-plan 04-design-language
           05-evidence-plan 06-demo-script 07-pitch 08-risk-register 09-hkt-delegation-api-ask
           10-test-plan lane-prompts facts-register adr/
schemas/   Mandate Cart Decision LogEntry CardRecord PacketState (JSON Schema, source of truth)
scripts/   docs-check.py trace-check.py
data/      capture-sheet shop-probe real-card-test (templates), fixtures/ (planned), raw/ (gitignored)
apps/web apps/verifier                      lane C   (planned)
packages/core packages/rail-sim             lane A   (planned)
packages/agent                              lane B   (planned)
packages/harness                            lane D   (planned)
```

## Commands
- **Work today** (stdlib Python): `python3 scripts/docs-check.py` (caps, unknown F-IDs, numbers without an ID, PAN-like runs, style; `--update-register` refreshes the Used-in column) and `python3 scripts/trace-check.py` (SR/E traceability, ID coverage, links).
- **TBD until scaffold task X-01 lands**:
```
pnpm install        pnpm test          pnpm -r typecheck     pnpm dev
pnpm harness        pnpm verify-log    pnpm keys:gen         pnpm demo:reset
pnpm docs:check     (unknown F-IDs, numbers without an ID, PAN-like digit runs, secrets)
```

## Working agreements
- **Parallel by default**: one Claude Code session per lane in its own git worktree and branch; subagents for independent work; never two sessions in one package.
- **Contracts first**: change `schemas/` or a port in `docs/02-architecture.md` by PR and tell every lane. Never fork a shape locally.
- **Policy engine tests first**: failing test (T-I*, T-S*), then code. `packages/core` coverage target [F44].
- **No new number without a register ID.** Docs cite `[F#]`; code reads thresholds from config that cites the ID.
- **Provenance tags**: OBSERVED(date) / SIMULATED / MEASURED(n) / ASSUMED. The UI shows a chip beside every number. A rate, fee or points value nobody observed and timestamped is a fabrication.
- **Label the rail SIMULATED** wherever it appears. Say "not found", never "does not have", about HKT or others.
- **Fail closed** on every error path. Judge output can tighten a decision, never loosen it.
- **Planner isolation**: planner code imports nothing from rail-sim or signing code and holds no card material.
- **Secrets**: `.env`, `.keys/`, `data/raw/` never committed. No PAN/CVV in code, fixtures, logs, prompts or screenshots. A human types the card in the real-card test.
- **Code style**: TypeScript strict, immutable updates (return new objects), money as integer minor units, validate at boundaries against `schemas/`, files under 400 lines typical and 800 max.
- **Commits**: `<type>: <description>` with type feat, fix, refactor, docs, test, chore, perf or ci. No attribution lines.

## Definition of done per lane
- **A policy + rail**: every rule R1-R12 unit-tested with tests written first; T-I1..T-I8, T-S1..T-S6, T-R1 green; log verifies offline (T-V1); coverage of `packages/core` meets [F44]; no PAN or CVV anywhere (I8); rail outputs carry a SIMULATED label; `pnpm test` green.
- **B agent + Jev**: planner can call only `propose_cart` (I4); Jev adapter and llm fallback pass the JudgePort contract tests including timeout and error ⇒ fail closed (I5); shadow mode logs judge output with no effect; model version and latency logged; fixtures for S2 and S3 give the expected judge outputs; no secrets in the repo.
- **C UI + verifier**: screens seal, run, console, log + verifier, evidence, presenter built to 04; every number wears a provenance chip; stop banners render from rule templates; verifier works offline and fails on tamper (T-V1); contrast and 44px touch targets pass; mobile-first view; reduced motion respected.
- **D evidence + pitch**: at least 100 seeded scenarios (target 150-200) [F37] run through B0, B1, B2 with MEASURED(n) results; captures logged in `data/capture-sheet.md`; real-card test and shop probe done or marked skipped with the reason; four timed rehearsals [F41]; backup video recorded; deck matches 07; every touched register row is OBSERVED or still READ-BY-CLAUDE.

## Cut order and triggers [F41]
- **Cut first to last (D9)**: teen chain, screenshot intake (only if under 2 h), reconciliation, did:key (keep Ed25519), harness 200 → 100 [F37], Scameter → manual capture only. DM6 in the demo goes before any of these.
- **Triggers**: H2 no Jev key ⇒ fallback judge only · H6 no end-to-end stop ⇒ crypto to hash-chain only · H10 still failing ⇒ Track 4 contingency (D8) · H12 no real-card test ⇒ sim-only, say so.

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
- Risk and ask: `docs/08-risk-register.md` · `docs/09-hkt-delegation-api-ask.md`
