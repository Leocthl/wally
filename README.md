# Lai See Agent (利是 Agent)

- A sealed-budget mandate engine for AI shopping agents. The card rail is **SIMULATED**. Not affiliated with HKT, Tap & Go or Mastercard.
- **Status**: built during HacKU 2026 (48 h), FinTech track "Give a Machine a Wallet - Agentic Commerce" [F13]. Code freeze 2026-10-04 13:00 HKT; no changes after it [F16].

## What and why
- **What**: a shopper seals a packet, for example "HK$800 this month, clothes, verified sellers" (illustrative, SIMULATED [F20]), signed as a W3C VC 2.0 delegation credential. An agent proposes carts, deterministic rules decide, and only an approved cart gets a single-use token for the exact total.
- **Why**: online shopping scams are the most prevalent type of deception in the Hong Kong police review [F4]. The agent-payment pilots we found run through banks and issuers; none we found cover prepaid wallets or teens [F7a, F7b].
- **Enforced in code**: signed credential, decrementing packet, expiry, revocation, seller check, single-use token with a blocked replay, and a typed judge that can only tighten a decision. No limit lives in a prompt.
- **Stops**: an over-budget cart (shipping included), a flagged or unverified seller, injected listing text, a revoked or expired mandate, an unanswered escalation.
- **Checkable**: every decision is a signed, hash-chained log entry that an offline page verifies.

## Real vs simulated
| Part | Status |
|---|---|
| Policy engine, credential, signed log, offline verifier | Real code |
| Judge | Laya, a third-party open-source typed model, running on the demo laptop; listing text never leaves it [F11c] |
| Planner | A Laya decision loop inside a deterministic harness: typed, logged choices (item, variant, next action). Not a generative LLM |
| Card rail (Single Use Card semantics [F1]), merchant lock | SIMULATED |
| Merchants and the flagged-seller fixture | SIMULATED |
| One real card decline, shop-readiness probe | Human-run captures, when done [F39, F40] |
| Every number | Tagged OBSERVED, SIMULATED, MEASURED or ASSUMED in the [facts register](docs/facts-register.md) |

- **Limits**: Laya cannot read raw pages, do arithmetic or write text, so listings arrive as structured records and all arithmetic is code. Planner and judge share one model, so the engine rules and the rail limit use no model.
- **Shortcut**: the demo web API holds the delegator's throwaway key; a real deployment keeps it on the shopper's device.

## Submission
- **Deck**: pending
- **3-minute video**: pending
- **Live demo**: at the booth; it runs with no network and no API key
- **Declaration**: HKT problem statement

## Quickstart
- **TBD until the scaffold lands.** No API key is needed; the judge runs locally from `services/laya/`.

```sh
pnpm install   # TBD
pnpm dev       # TBD
```

## Repo map
```
apps/web            UI (incl. the booth screen) and thin API
apps/verifier       offline log verifier page
packages/core       schemas to types, packet math, rules R1-R12, engine, credential, crypto, log
packages/rail-sim   SIMULATED rail
packages/agent      planner harness and judge adapters
packages/harness    replay harness
services/laya       local Laya server scripts (model weights are not committed)
schemas/            JSON schemas
data/               fixtures and capture templates
docs/               planning docs
```

## Docs
- [00 Context](docs/00-context.md): event, decisions, canonical IDs · [Facts register](docs/facts-register.md): every number and its provenance
- [01 Product brief](docs/01-product-brief.md) · [02 Architecture](docs/02-architecture.md) · [03 Implementation plan](docs/03-implementation-plan.md)
- [04 Design language](docs/04-design-language.md) · [05 Evidence plan](docs/05-evidence-plan.md) · [06 Demo script](docs/06-demo-script.md) · [07 Pitch](docs/07-pitch.md)
- [08 Risk register](docs/08-risk-register.md) · [09 HKT delegation API ask](docs/09-hkt-delegation-api-ask.md): proposal, not an HKT commitment · [10 Test plan](docs/10-test-plan.md)

## Credits
- **Laya** (judge and planner decisions) by Convai Innovations, Apache-2.0, run locally and unmodified [F11c].
- **Libraries**: @noble/curves, @noble/hashes, @scure/base, ajv, json-schema-to-typescript, vitest, fast-check, React, Vite, Hono. Licences and the full list: [THIRD_PARTY.md](THIRD_PARTY.md).
- **AI coding assistants** were used, as the event rules allow; the team can explain every module [F16].

## Licence
`TBD`

Built for HacKU 2026, FinTech track. Not affiliated with HKT, Tap & Go or Mastercard. No logos or brand assets used.
