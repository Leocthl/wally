# Lai See Agent (利是 Agent)

A sealed-budget mandate engine for AI shopping agents. The card rail is **SIMULATED**.

- **Status**: planning docs and schemas; application code is not scaffolded yet.

## What and why
- **What**: a shopper seals a packet, for example "HK$800 this month, clothes, verified sellers" (illustrative, SIMULATED [F20]). An agent proposes carts, deterministic rules decide, and only an approved cart gets a one-off card, minted for the exact total.
- **Why**: online shopping scams are the most prevalent type of deception in the Hong Kong police review [F4]. The agent-payment pilots we found run through banks and issuers; none we found cover prepaid wallets or teens [F7a, F7b].
- **Enforced in code**: signed mandate, decrementing packet, expiry, revocation, a seller check, and a typed judge that can only tighten a decision. No limit lives in the prompt.
- **Stops**: an over-budget cart (shipping included), a flagged or unverified seller, injected listing text, a revoked or expired mandate, an unanswered escalation.
- **Checkable**: every decision is a signed, hash-chained log entry that an offline page verifies.

## Real vs simulated
| Part | Status |
|---|---|
| Policy engine, signed log, offline verifier | Real code |
| Planner (Claude) and judge (Jev, or a fallback model) | Real model calls |
| Card rail (Single Use Card semantics [F1]) | SIMULATED |
| Merchants and the flagged-seller fixture | SIMULATED |
| One real card decline, shop-readiness probe | Human-run captures, when done [F39, F40] |
| Every number | Tagged OBSERVED, SIMULATED, MEASURED or ASSUMED in the [facts register](docs/facts-register.md) |

## Demo and evidence
- `TODO: demo video`
- `TODO: harness results`
- Capture and test protocols: [docs/05-evidence-plan.md](docs/05-evidence-plan.md)

## Quickstart
- **TBD until the scaffold lands.**

```sh
pnpm install   # TBD
pnpm dev       # TBD
```

## Repo map
- **Planned layout**: `apps/` and `packages/` are not scaffolded yet.

```
apps/web            UI and thin API
apps/verifier       offline log verifier page
packages/core       schemas to types, packet math, rules R1-R12, engine, crypto, log
packages/rail-sim   SIMULATED rail
packages/agent      planner and judge adapters
packages/harness    replay harness
schemas/            JSON schemas
data/               fixtures and capture templates
docs/               planning docs
```

## Docs
- [00 Context](docs/00-context.md): event, decisions, canonical IDs
- [Facts register](docs/facts-register.md): every number and its provenance
- [01 Product brief](docs/01-product-brief.md)
- [02 Architecture](docs/02-architecture.md)
- [03 Implementation plan](docs/03-implementation-plan.md)
- [04 Design language](docs/04-design-language.md)
- [05 Evidence plan](docs/05-evidence-plan.md)
- [06 Demo script](docs/06-demo-script.md)
- [07 Pitch](docs/07-pitch.md)
- [08 Risk register](docs/08-risk-register.md)
- [09 HKT delegation API ask](docs/09-hkt-delegation-api-ask.md): proposal, not an HKT commitment
- [10 Test plan](docs/10-test-plan.md)

## Licence
`TBD`

Built for HacKU 2026, FinTech track. Not affiliated with HKT, Tap & Go or Mastercard. No logos or brand assets used.
