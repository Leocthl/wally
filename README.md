# Wally

- A sealed-budget mandate engine for AI shopping agents. The card rail is **SIMULATED**. Not affiliated with HKT, Tap & Go or Mastercard.
- **Status**: built during HacKU 2026 (48 h), FinTech track "Give a Machine a Wallet - Agentic Commerce" [F13]. Code freeze 2026-10-04 13:00 HKT; no changes after it [F16].

## What and why
- **What**: a shopper seals a packet, for example "HK$800 this month, clothes, verified sellers" (illustrative, SIMULATED [F20]), signed as a W3C VC 2.0 delegation credential. An agent proposes carts, deterministic rules decide, and only an approved cart gets a single-use token for the exact total.
- **Why**: online shopping scams are the most prevalent type of deception in the Hong Kong police review [F4]. The agent-payment pilots we found run through banks and issuers; none we found cover prepaid wallets or teens [F7a, F7b].
- **Enforced in code**: signed credential, decrementing packet, expiry, revocation, seller check, single-use token with a blocked replay, and a typed judge that can only tighten a decision. No limit lives in a prompt.
- **Stops**: an over-budget cart (shipping included), a flagged or unverified seller, injected listing text, a revoked or expired mandate, an unanswered escalation.
- **Checkable**: every decision is a signed, hash-chained log entry that an offline page verifies: tamper, order and (with a checkpoint) truncation, plus consent and money for what is logged.

## Real vs simulated
| Part | Status |
|---|---|
| Policy engine, credential, signed log, offline verifier | Real code |
| Judge | Laya, a third-party open-source typed model, running on the demo laptop; listing text never leaves it [F11c] |
| Planner | Chosen at start: `local` Qwen3.5 on the laptop if it answers [F27], else `rule` (a Laya decision loop in a deterministic harness, typed and logged), else `replay` (recorded). No generative model gates a decision |
| On-device mode | The real engine, log and SIMULATED rail run in the page with recorded planner and judge answers; typed text escalates; the page holds every key |
| Card rail (Single Use Card semantics [F1]), merchant lock | SIMULATED |
| Merchants and the flagged-seller fixture | SIMULATED |
| One real card decline, shop-readiness probe | Human-run captures, when done [F39, F40] |
| Every number | Tagged OBSERVED, SIMULATED, MEASURED or ASSUMED in the [facts register](docs/facts-register.md) |

- **Limits**: the models read no raw pages and do no arithmetic: listings arrive as structured records and all arithmetic is code. The engine rules and the rail limit use no model. Known gaps are in [CLAUDE.md](CLAUDE.md).
- **Shortcut**: the demo web API holds the delegator's throwaway key, and on-device mode makes every key in the page; a real deployment keeps the delegator key on the shopper's device.

## Submission
- **Deck**: pending
- **3-minute video**: pending
- **Live demo**: at the booth; it runs with no network and no API key
- **Declaration**: HKT problem statement

## Quickstart
- No API key is needed; the models run locally from `services/`. Node 22.12 or newer and pnpm.

```sh
pnpm install
services/laya/setup.sh && services/laya/serve.sh   # judge, once; weights are not committed
pnpm demo                                          # preflight, build, API and UI on http://127.0.0.1:8787
```
- Without Laya the booth still runs and every decision escalates (`R10.unavailable`). `?api=local` runs the page alone. Start `services/qwen/serve.sh` as well and the booth uses Qwen as planner. Checks: `pnpm typecheck && pnpm lint && pnpm test`.

## Repo map
```
apps/web            PWA (incl. the booth screen), booth server, on-device mode
apps/verifier       offline log verifier page
packages/core       schemas to types, packet math, rules R1-R12, engine, credential, crypto, log, verifier, cart, executor, orchestrator
packages/rail-sim   SIMULATED rail and merchant stub
packages/agent      planners, sentence compiler, judge adapters
packages/harness    replay harness
services/laya       local Laya server scripts (model weights are not committed)
services/qwen       local Qwen server scripts (model weights are not committed)
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
- **Laya** (judge, and the `rule` planner's typed choices) by Convai Innovations, Apache-2.0, run locally and unmodified [F11c].
- **Qwen3.5** (planner and sentence compiler) by the Qwen team, Alibaba Cloud, Apache-2.0; GGUF quants by bartowski; served by llama.cpp (MIT) [F27].
- **Libraries**: @noble/curves, @noble/hashes, @scure/base, canonicalize, ajv, json-schema-to-typescript, vitest, fast-check, Playwright, React, Vite, Hono. Licences and the full list: [THIRD_PARTY.md](THIRD_PARTY.md).
- **AI coding assistants** were used, as the event rules allow; the team can explain every module [F16].

## Licence
`TBD`

Built for HacKU 2026, FinTech track. Not affiliated with HKT, Tap & Go or Mastercard. No logos or brand assets used.
