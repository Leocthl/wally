# Wally

- A sealed-budget wallet for AI shopping agents. The card rail is **SIMULATED**. Not affiliated with HKT, Tap & Go or Mastercard.
- **Live demo**: https://wally-dev.vercel.app opens the on-device app in any browser: the real engine and rules with recorded model answers, no server. The booth Mac runs the live models.
- **Built** during HacKU 2026 (48 h), FinTech track "Give a Machine a Wallet - Agentic Commerce" [F13]. Code freeze 2026-10-04 13:00 HKT; no changes after it [F16].

## What it does
- **Seal**: write a sentence, for example "HK$800 this month, clothes, verified sellers" (illustrative, SIMULATED [F20]). Wally suggests rules, you edit them and sign them as a W3C VC 2.0 delegation credential.
- **Shop**: type, speak or show a photo (a screenshot works too). A planner proposes a cart, a judge reads the listing as data, and deterministic rules decide. Only an approved cart gets a one-off card for the exact total.
- **Stops**: over budget (shipping included), a flagged or unverified seller, orders hidden in a listing, a cancelled or ended budget, an unanswered Needs your OK.
- **Proof**: every decision is a signed, hash-chained receipt. An offline page checks tamper, order, truncation (with a checkpoint), consent and money for what is logged.
- **Family budget** (optional): a parent's budget caps a child's; a wider ask is refused.
- **Why**: online shopping scams are the most prevalent type of deception in the Hong Kong police review [F4]; the agent-payment pilots we found run through banks and issuers [F7a, F7b].

## Real vs simulated
| Part | Status |
|---|---|
| Policy engine, credential, signed log, offline verifier | Real code |
| Judge | Laya, third-party and open source, on the booth Mac [F11c] |
| Planner and sentence reader | Qwen3.5, third-party and open source, on the booth Mac [F27]; else the Laya loop, else recorded answers. No model gates a decision |
| On-device mode | The real engine in the page with recorded model answers; the page holds every key |
| Photo reader | Qwen3.5 with its vision projector, on the booth Mac only [F63a]; names the kind of garment, not the photo [F68a]; the on-device page asks the shopper to tap the kind |
| Card rail (Single Use Card semantics [F1]), merchants, flagged seller | SIMULATED |
| Real-card decline, shop probe | Human-run captures, not done yet [F39, F40] |
| Every number | Tagged in the [facts register](docs/facts-register.md) |

## Run it three ways
- No API key. **Needs**: Node 22.18 or newer, pnpm, Python 3.13 with `uv` (Laya), `brew install llama.cpp` (Qwen), Xcode or Android Studio only for the native shells. Model weights are fetched once and not committed.
1. **Booth Mac** (live judge and planner):
```sh
pnpm install
services/laya/setup.sh && services/laya/serve.sh     # judge
services/qwen/setup.sh && services/qwen/serve.sh     # planner, optional
pnpm demo                                            # http://127.0.0.1:8787
```
2. **On-device** (no server, no models): `pnpm --filter @wally/web dev`, then open `http://127.0.0.1:5173/?api=local`. The page also falls back to this when no booth answers.
3. **Phones**: `pnpm demo:lan`, then scan the QR in About or Presenter on the same Wi-Fi. Or build the native shells: `apps/mobile/README.md`.
- Without Laya the booth still runs and every judged decision escalates. `PLANNER_PROVIDER=rule` pins the Laya planner (default `auto`).

## Commands
| Command | Does |
|---|---|
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm coverage` | CI steps; `pnpm gen:types` after a schema change |
| `pnpm invariants` | the eight invariant tests, one line each (about 30 s) |
| `pnpm demo:reset` | new demo keys, empty logs, back to the sealed budget |
| `pnpm harness -- --seed 7 --n 150 --judge live` | replay harness, B0 B1 B2 |
| `pnpm verifier`, `pnpm verify-log <log> <keys>` | offline verifier page, log check |
| `python3 scripts/docs-check.py` | doc caps, F-IDs, style |

## Honest status
- **Harness**, seed 7, 150 SIMULATED scenarios, commit da2c814: 0/120 over-limit mints, 61/66 legitimate approved (92.4%); what each layer adds: AI alone (our B0 baseline) let 43 of 84 stop cases through, rules only 28, rules plus judge 0 (an upper bound of about 4 in 100 [F96]), at the price of 5 of 66 honest buys blocked against 3; decision latency p50 159.7 ms, p95 388.9 ms [F69]. Counts among generated scenarios, not a proof.
- **Judge** alone let 8/40 attack items through, 6/20 held out; the seller gate is inert [F36, F69]. The rules and the rail limit use no model.
- **Qwen**: 25 calls over 26 author-written scenarios, no held-out set, few Cantonese cases [F68]. **Photo reader**: right kind of garment in 25 of 29 retailer photos [F68a].
- **Tests**: over 4,000 automated tests; core line coverage above 95%; exact numbers and the last green CI commit in [F91].
- **Shortcuts**: the booth server holds the delegator's demo key, and Mum's for a family budget. The offline page cannot check the parent link.
- **Not done**: manual-route stopwatch; native zh-HK read; a physical-phone test. LAN is plain http with one shared token [F92]. Voice uses the browser's speech service.

## Docs
- [00 Context](docs/00-context.md): event, decisions, IDs · [Facts register](docs/facts-register.md): every number
- [01 Brief](docs/01-product-brief.md) · [02 Architecture](docs/02-architecture.md) · [03 Plan](docs/03-implementation-plan.md) · [04 Design](docs/04-design-language.md)
- [05 Evidence](docs/05-evidence-plan.md) · [06 Demo](docs/06-demo-script.md) · [07 Pitch](docs/07-pitch.md) · [08 Risks](docs/08-risk-register.md)
- [09 HKT ask](docs/09-hkt-delegation-api-ask.md): a proposal, not an HKT commitment · [10 Tests](docs/10-test-plan.md) · [11 Explain the code](docs/11-explain-the-code.md) · [12 Hallway interviews](docs/12-hallway-interviews.md) · [CLAUDE.md](CLAUDE.md)

## Credits
- **Laya** (judge) by Convai Innovations, Apache-2.0, run locally and unmodified [F11c].
- **Qwen3.5** (planner, sentence reader) by the Qwen team, Alibaba Cloud, Apache-2.0; GGUF quants by bartowski; served by llama.cpp (MIT) [F27].
- **Libraries**: React, Vite, Hono, Capacitor, NumberFlow, uqr, @noble/curves, @noble/hashes, @scure/base, canonicalize, ajv, Vitest, fast-check, Playwright, axe-core. Licences and the full list: [THIRD_PARTY.md](THIRD_PARTY.md).
- **AI coding assistants** were used, as the event rules allow; the team can explain every module [F16].

## Licence
- **Apache-2.0** ([LICENSE](LICENSE), [NOTICE](NOTICE)). Third-party code and models keep their own licences: [THIRD_PARTY.md](THIRD_PARTY.md).
- Built for HacKU 2026. No logos or brand assets used.
