# 00 Context

## Event
- **HacKU 2026**: HKU Computer Science Association with HKIAIA, 48h inter-university hackathon, HKU Main Campus [F13]
- **Track**: FinTech, directed track "Give a Machine a Wallet - Agentic Commerce", sponsored by HKT. Our team declared it [F13, F17]
- **Clock**: code freeze 2026-10-04 13:00 HKT; no repository changes after it [F16]. Wall-clock plan [F41]
- **Format**: every team gets a booth; judges watch or try the demo, 5 min per team (3 pitch + 2 Q&A). Only the top 8 pitch on stage, 5 + 2 [F14]
- **Submit**: pitch deck, public GitHub link, prototype video (3 min) or live link, declaration of problem statement and extra awards [F18]
- **Unknown**: HKT sandbox, API or mentor access [F17]
- **Product**: Wally, a sealed-budget mandate engine for AI shopping agents

## Statement digest
| ID | Requirement (binding; the evidence paragraph is the scoring sheet) |
|---|---|
| SR1 | Scope: ONE spending decision, ONE delegating party |
| SR2 | Define what the agent may do, may not do, and how a limit is enforced (cap, mandate, expiry, rule, revocation) |
| SR3 | Demo one complete transaction end to end |
| SR4 | Include at least one case where the agent is stopped |
| E1 | Log of what the agent was permitted to do |
| E2 | Show it stopped: limit held, mandate expired, or spend refused |
| E3 | Compare against the manual route: steps, time, cost |
| E4 | State the decision rule so a user can understand why |
| E5 | Every rate, fee and points value observed and timestamped |

- **Directions we use (DIR1-11)**: 1 plain-language mandate; 2 adaptive cap; 3 expiry; 4 checkout stopped when shipping pushes the total past the cap; 5 revocation mid-transaction; 6 escalation that expires unanswered; 7 log a third party can verify without trusting the operator; 8 "why" answered from the recorded rule, not post-hoc prose; 9 injected listing text; 10 replay harness reporting overspend rate; 11 who holds the loss when a purchase should not have happened
- **Not in our scope** (the statement allows them as centres of work; we chose the enforcement territory): rewards optimisation, multi-merchant comparison, agent-to-agent negotiation

## What gets scored
| Judge | Criterion | Weight | Our answer |
|---|---|---|---|
| HKT award | Problem-solution fit | 25% [F15] | one decision, one delegator, evidence E1-E5 |
| HKT award | Technical execution, working prototype | 25% [F15] | real engine, signed log, verifier, harness; the planner replans after a stop |
| HKT award | UX and desirability, especially Gen Z | 20% [F15] | phone-first app with Wally, EN + zh-HK, phones join the booth by QR |
| HKT award | Security and trust design | 15% [F15] | delegation credential (DID-VC), policy engine, consent by escalation, hash-chained log, fail closed |
| HKT award | Feasibility of integration with any payment means | 15% [F15] | single-use tokens on SUC semantics [F1]; RailPort portability in 09 |
| Technical judges at the booth | 6 criteria, 5 marks each [F15] | 30 marks | a demo a judge can drive in 5 min [F14] |
| Pitching judges (top 8) | 6 criteria, 5 marks each [F15] | 30 marks | 5 + 2 min script in 07 |

- **HKT's workshop lists the evidence it wants** [F19]: signed delegation credential, ALLOW/DENY verifier output, a denied out-of-policy purchase, revocation, approve/reject/escalate, a single-use token with a blocked replay, failure injection without a duplicate payment, an audit timeline. The demo shows each.
- **Code rules** [F16]: written during the 48h, open source credited (README + THIRD_PARTY.md), AI assistants fine, the team can explain core logic and architecture.

## Decisions
| ID | Decision | Alternative recorded in |
|---|---|---|
| D1 | Mandate engine on HKT rails + four upgrades (D6). Title "Lai See Agent", renamed Wally (D14); the technical plan never depended on the metaphor | none |
| D2 | Delegator: HK Gen Z shopper [F24] seals a monthly clothing packet [F20] and delegates apparel buying from shop links. Optional family budget (D17): a parent's budget caps a child's, so agent <= child budget <= parent budget. Minors are not the headline | ADR-0005 |
| D3 | Chain: signed mandate → planner (untrusted: Laya loop, local Qwen or replay) → judge (Laya, veto/escalate only) → policy engine (deterministic) → rail (SUC semantics) → merchant. Every decision → signed hash-chained log → offline verifier | ADR-0002 |
| D4 | Invariants I1-I8 (below). Explanations render from rule templates + recorded inputs, never LLM prose | ADR-0002 |
| D5 | The judge is a typed probabilistic gate, not the agent. Default provider Laya running locally on the Mac [F11c] (Jev-compatible wire protocol; hosted Jev optional [F11]); recorded replay for CI and as the booth fallback; `enforce` is the default mode, `shadow` only records; report only latency and cost we measure | ADR-0001 |
| D6 | Upgrades: U1 decrementing sealed packet; U2 mint-on-approval; U3 seller-risk gate before minting; U4 rail simulator calibrated on one real decline + 10-shop readiness probe | ADR-0003 |
| D7 | No issuing API found [F1]: rail is SIMULATED and labelled so everywhere. A processed payment cannot be cancelled [F2]: demo revocation before mint or before first use; after payment use dispute + loss rule | ADR-0003 |
| D8 | Contingency only: if the H10 trigger fires [F41], switch to Track 4 "overnight desk that escalates" | 08 |
| D9 | Cut order, first to go: reconciliation, harness 200 → 100 [F37], Scameter → manual capture only. did:key is not cut: HKT's workshop centres on DID-VC [F19]. Screenshot intake and the teen chain left the list: they shipped as Show Wally a photo (D18) and the family budget (D17) | 03 |
| D10 | First-2-hour kill tests: real-card decline [F40]; shop probe [F39]; ask an HKT mentor whether a delegate SUC API is planned [F17] | 03, 05 |
| D11 | The mandate is an AgentDelegationCredential: W3C VC 2.0 envelope, issuer = delegator did:key, Data Integrity proof (eddsa-jcs-2022). The engine reads `credentialSubject`; R1 verifies the proof [F19] | ADR-0007 |
| D12 | Superseded by D15 for the planner. Still in force: local-first, no API keys to run the demo, judge = Laya on 127.0.0.1. Was: planner = `rule` (structured parser + Laya typed item choice) and `replay` only, `claude` optional, no second model [F27] | ADR-0008 |
| D13 | Booth first: the demo is built for a judge who drives it for 5 min [F14]; the finalist pitch reuses it. Single-use token semantics include a blocked replay and a SIMULATED merchant lock [F19] | 06, 07 |
| D14 | Name: Wally (user decision 2026-10-02). No red-packet theming: cool-wallet look (light fintech UI, blue primary, teal accent, a wallet character), red or orange only for stop and error. No HKT, Tap & Go or Mastercard logos; the look may be aligned to Tap & Go's design language once the team supplies references | none |
| D15 | A second local model is allowed (supersedes D12): Qwen3.5-9B (4B selectable) on llama.cpp, 127.0.0.1 only [F27, F63], plans natural-language requests (English, Chinese, Cantonese) and compiles the sentence into suggested rule chips the shopper confirms. Laya stays the judge; Qwen never gates a decision; rules, the rail limit and Laya's gate stay in charge; `rule` and `replay` planners remain the fallbacks. There is still no LLM judge. The `claude` provider is removed | ADR-0008, ADR-0009 |
| D16 | Mobile first: a PWA-first web app (manifest, service worker that never caches `/api`, install prompt, safe areas), phones are the main target; on-device mode runs the real engine in the browser with recorded model answers; Capacitor wrappers for iOS and Android (`apps/mobile`) are built and checked on a simulator and an emulator, not on a physical device | 03 |
| D17 | LAN, family and voice restored to scope after the early finish. LAN mode (`pnpm demo:lan`): phones on the booth Wi-Fi drive the live booth with a pairing token and a QR code. Family budget, optional: a parent's budget (Mum) caps a child's, a wider child is refused `EXCEEDS_PARENT`, and the offline verifier cannot check the parent chain. Voice input in the Ask sheet through the browser's speech service. Each stays optional and labelled | ADR-0005, 02 §15, 08 |
| D18 | Shopper first, decided 2026-10-03 after a user-feedback review. Plain words by default with a Developer mode, a personal first run, a shopper-first Home. Show Wally a photo: a picture, a screenshot or words become typed fields (the local Qwen model names the kind of garment [F68a]; code does colours, price and the match against a small SIMULATED shop), and the rules decide as for any ask. The on-device session survives a reload [F106]; each phone on the booth Wi-Fi gets its own practice wallet [F108]. The rail stays SIMULATED | 02 §14, 06, 08 |

## Canonical IDs
- **One name per thing.** Use these exactly. Do not rename or renumber.

### Invariants
| ID | Invariant |
|---|---|
| I1 | No mint without APPROVE from the policy engine |
| I2 | Minted limit == approved cart total (<= min(remaining, rail ceiling [F1])) |
| I3 | Judge output can only change APPROVE to DENY or ESCALATE, never the reverse |
| I4 | Planner has no credentials and no payment tool |
| I5 | Any error, timeout or unknown ⇒ DENY or ESCALATE (fail closed) |
| I6 | Revoked or expired mandate never mints |
| I7 | Every decision has exactly one signed log entry; the chain verifies offline |
| I8 | No PAN/CVV in logs, files or prompts |

### Rules (policy engine)
| ID | Rule | On fail |
|---|---|---|
| R1 | Mandate signature valid (delegator key) | DENY |
| R2 | Mandate not revoked, not expired | DENY |
| R3 | Cart total <= packet remaining (total includes shipping, fees, FX) | DENY |
| R4 | Cart total <= per-purchase cap (fixed, or adaptive share of remaining); above `ask_above` ⇒ ESCALATE | DENY or ESCALATE |
| R5 | Cart total <= rail ceiling [F1] | DENY |
| R6 | Merchant and category inside the mandate | DENY |
| R7 | Velocity inside limit [F32] | DENY |
| R8 | Active cards below rail maximum [F1] | DENY |
| R9 | Seller check: Scameter capture state + seller identifiers; "no record" is not "safe" [F6] | flagged DENY, unverified ESCALATE |
| R10 | Judge thresholds [F36, F50]: injection, scope fit, seller risk, escalate_or_proceed | DENY or ESCALATE |
| R11 | Escalation unanswered after the window [F31] | DENY |
| R12 | Price drift between approval and checkout voids the approval | DENY; new cart, new DECISION |

- **Hard rules** are R1-R8 and R12: an escalation resolution can never override them. Only ESCALATE outcomes (R4 `ask_above`, R9 unverified, R10) can be resolved by the delegator.

### Stops
| ID | Stop | Rules | Log entries |
|---|---|---|---|
| S1 | Over budget incl. shipping/FX | R3, R4 before mint; R12 + rail decline after mint (limit held) | `DECISION(DENY)`; `CARD_EVENT(DECLINED)` |
| S2 | Flagged or unverified seller | R9 (+ R10 seller score) | `DECISION(DENY)` or `DECISION(ESCALATE)` |
| S3 | Injected listing text | R10 | `DECISION(DENY)` |
| S4 | Revocation before mint or first use | R2; rail void | `MANDATE_REVOKED`, then `DECISION(DENY)` or `CARD_EVENT(VOIDED)` |
| S5 | Escalation expires unanswered | R11 | `DECISION(DENY)` that resolves an earlier `DECISION(ESCALATE)` |
| S6 | Velocity burst or expired mandate | R7, R2 | `DECISION(DENY)`; `PACKET_EXPIRED` |

- **Every DENY/ESCALATE cites at least one rule ID.** R5, R6, R8 stops exist outside S1-S6 (harness only).
- **Demo stops**: live S2, S1, S3. Reserve S4, S5. S6 harness only.
- **Explanation template IDs** (`<rule>.<variant>`): R2.revoked, R2.expired, R3.over_remaining, R4.over_cap, R4.ask_above, R7.velocity, R9.flagged, R9.unverified, R10.injection, R10.seller_risk, R10.scope, R11.expired, R12.price_drift. Harness-only and failure variants: R1.invalid_signature, R5.over_ceiling, R6.off_mandate, R8.max_active, R10.escalate, R10.unavailable (judge failed, I5). Rendered by pure functions from recorded inputs, never LLM prose.

### Enums
| Name | Values |
|---|---|
| Decision outcome | `APPROVE`, `DENY`, `ESCALATE` |
| Log entry kind | `MANDATE_SEALED`, `DECISION`, `CARD_MINTED`, `CARD_EVENT`, `MANDATE_REVOKED`, `PACKET_EXPIRED` |
| Card event | `AUTHORISED`, `DECLINED`, `VOIDED`, `EXPIRED` |
| Decline code | `OVER_LIMIT`, `CARD_USED`, `CARD_VOIDED`, `CARD_EXPIRED`, `UNKNOWN_HANDLE`, `MERCHANT_MISMATCH` (SIMULATED: SUC has no merchant lock [F1]) |
| Card state | `ACTIVE`, `USED`, `VOIDED`, `EXPIRED` |
| Packet status | `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED` |
| Escalation state | `OPEN`, `APPROVED`, `DENIED`, `EXPIRED` |
| Judge questions | `scope_fit`, `injection_risk`, `seller_risk`, `escalate_or_proceed` |
| Judge provider | `laya` (default, local), `jev` (hosted, optional), `replay` (recorded answers for CI and the booth fallback) |
| Planner provider | `rule` (Laya decision loop), `local` (Qwen), `replay` (recorded fixtures; CI default); the booth server's `auto` picks one at start. `claude` is removed |
| Client mode | `http` (booth server), `local` (on-device, recorded answers), `mock` (tests only) |
| Money | integer minor units (HKD cents), currency `HKD` |

### Pipeline contract v0
```
seal      Delegator signs the AgentDelegationCredential (VC 2.0) → log MANDATE_SEALED → PacketState (folded from the log)
propose   Planner (untrusted; only tool: propose_cart) → Cart
assess    judge.assess(cart, listing, scameterCapture) → JudgeRecord               // laya (local), jev or replay; never throws, status OK | TIMEOUT | ERROR
decide    engine.decide(mandate, packet, cart, judge, now, resolution?, ctx?) → Decision   // pure, deterministic, R1-R12
record    log.append(DECISION)                                                     // I7, before any side effect
mint      on APPROVE: re-fold the log, then rail.mint(limit = cart.total, ttl) → CardRecord; log.append(CARD_MINTED)
escalate  on ESCALATE: open escalation; a signed answer bound to that cart resolves it, or the window ends → R11
checkout  executor (deterministic code, never the planner) re-quotes (engine.decideCheckout, R12), presents the card
          handle to the merchant stub; log.append(the rail's own CARD_EVENT); planner sees status only, never PAN/CVV (I8)
revoke    Delegator signs revoke → log MANDATE_REVOKED → rail.void(unused cards) → CARD_EVENT(VOIDED)
verify    verifyChain(entries, publicKeys, headCheckpoint) → pass | first failing seq
```
- **Ports in `core`**: `PlannerPort`, `JudgePort`, `RailPort`, `MerchantPort`, `LogStore`, `Clock`, plus a `Signer`. `agent` and `rail-sim` implement them, `apps/web` composes. No package cycles. Exact signatures: 02 §18.
- **Packet accounting**: an APPROVE holds its limit (inside `committed_minor`) until its card is logged, a later decision resolves it, or the packet is revoked or expires. Then the card commits its limit; `VOIDED`/`EXPIRED` release it; `AUTHORISED` settles the charged amount and releases the difference.
- **Orchestrator**: one per packet; `seal` (with `parentCredential` for a family budget), `submit`, `suggestAlternatives`, `checkout`, `answerEscalation`, `revoke`, `tick`, `snapshot`, `subscribe`; one serialised queue; the log is the only state. A repeat of a live cart returns the earlier decision unless `allowRepeat`. A failure returns `{ ok: false, code }` and fails closed (I5). The delegator did:key is pinned at construction.
- **Judge starts as soon as the cart is built**, in parallel with the fold. The engine is the only producer of a Decision.

### Packages and lanes
| Lane | Scope | Paths (npm scope `@wally/*`) |
|---|---|---|
| A | policy + rail | `packages/core` (schemas→types, packet math, R1-R12, engine, crypto, log, orchestrator), `packages/rail-sim` |
| B | agent + judge | `packages/agent` (planner `rule`/`local`/`replay`, sentence compiler, judge adapters laya/jev + replay, shadow mode), `services/laya` (local judge), `services/qwen` (local planner model) |
| C | UI + verifier | `apps/web` (UI + thin API), `apps/verifier` (offline page) |
| D | evidence + pitch | `packages/harness`, `data/`, `docs/05`-`07`, `docs/09` |
| M | mobile, second model, brand | PWA shell and design system in `apps/web`, on-device mode, LAN mode, Capacitor shells in `apps/mobile`, `services/qwen` with the local planner and compiler |
| X | cross-lane | `schemas/`, fixtures in `data/fixtures/`, CI |

### Canonical demo (storyboard in 01, choreography in 06)
| ID | Moment | Covers |
|---|---|---|
| DM1 | Seal mandate M0: sentence → compiled rule chips → Seal. M0 has no separate per-purchase cap, so R3 is the binding rule | SR2, E1, E4 |
| DM2 | Attempt 1: mint HK$259 [F21]; packet meter shows HK$541 left. Overshoot beat on the live card: merchant stub in `overshoot` mode charges above the quote, rail declines `OVER_LIMIT` (limit held, S1 rail variant, SIMULATED); then the exact charge is authorised; then the same card is replayed and declined `CARD_USED` (blocked replay [F19]) | SR1, SR3, E2 |
| DM3 | Attempt 2: seller flagged, stopped by R9 (S2); the card never exists | SR4, E2 |
| DM4 | Attempt 3: HK$550 [F22] > HK$541 left, stopped by R3 (S1); no card exists | E2, E4 |
| DM5 | Attempt 3b: injected listing text, stopped by R10 (S3) | E2, DIR9 |
| DM6 | Attempt 4: mint HK$120 [F23] (optional, cut first if short on time) | SR3 |
| DM7 | Log timeline + verifier; flip one byte, verification fails | E1, E4, DIR7 |
| DM8 | Evidence: harness B0/B1/B2, manual-route comparison, provenance chips | E3, E5, DIR10 |
| DM9 | Where it breaks, who holds the loss, path to HKT | DIR11 |
| DMR1 | Reserve: revoke before first use, hold to confirm (S4) | DIR5 |
| DMR2 | Reserve: escalation expires unanswered (S5) | DIR6 |

- **Hands-on beats** (no DM ID): Ask Wally typed, spoken or as a photo (D18); See cheaper options after DM4; Needs your OK (DMR2); Cancel this budget (DMR1); Mum's budget and a refused ask [F93]; a phone joining by QR over the LAN (D17). Choreography in 06.
- **Run-of-show [F42]**: hook; demo (DM1-DM7, DM6 optional); evidence (DM8, where it breaks); market and moat; path to HKT (DM9); team.
- **Flagged-seller fixture is SIMULATED.** No real individual's phone, FPS ID or page name enters the repo. Real Scameter lookups appear only as redacted, timestamped captures.

### Test IDs
| ID | Test |
|---|---|
| T-I1 … T-I8 | Property tests, one per invariant |
| T-S1 … T-S6 | Scenario test, one per stop |
| T-H1 | Harness: no over-limit mint in deterministic scenarios [F38] |
| T-H2 | Harness: legitimate scenarios approved [F38] |
| T-H3 | Harness: every reported number is MEASURED(n) with seed + commit |
| T-V1 | Verifier detects byte flip, truncation, reorder |
| T-R1 | Rail-sim parity with F1 semantics + calibration vs the one real decline |
| T-E2E | Scripted demo path DM1-DM7 passes |

### Provenance and citation
- **Tags**: OBSERVED(date) / SIMULATED / MEASURED(n) / ASSUMED. The register row carries the tag; the doc cites the ID next to the number: `HK$2,000 [F1]`.
- **Never** write a number that is not in the register. Missing? Add the register row in the same commit as the doc that uses it.
- **No logos**, no lookalike branding.

## Assumptions to confirm
- [ ] **Team** is 3-4 and writes TypeScript; at least one member reads zh-HK for copy review
- [ ] **Someone holds** a Tap & Go Plus(ii) or Pro account (needed for the real-card test and F1 re-capture)
- [x] **Judge runs locally** (Laya on 127.0.0.1): no key, no vendor, listing text never leaves the Mac. Hosted Jev stays optional [F11c]
- [x] **Two local models, no key** (D15): Laya judges, Qwen plans and compiles; both bind 127.0.0.1, so listing text and the shopper's request stay on the Mac [F11c, F27]
- [ ] **Scameter**: manual, human-paced captures only. No terms on automated use were found and the Important Notice limits reproduction [F6]. The engine reads captures and never queries live
- [ ] **Dates**: no Mastercard or Visa announcement date goes on a slide until re-captured [F7a, F7b]
- [x] **Track declaration** submitted (confirmed by the user) [F13]
- [x] **Format, prizes, rubric, code rules** read from the organiser pack [F14-F16]
- [ ] **HKT** mentor or sandbox reachable at the venue [F17]
- [ ] **Optional**: SenseTime Raccoon award needs a declaration and real use of Raccoon [F15]; decide before the submission form closes
- [ ] **Rail is SIMULATED**; the judges accept this when labelled and calibrated on one real decline
- [ ] **Demo stops** are S2, S1, S3 live; the HK$800 storyline [F20-F23] is the lead's default; thresholds [F36] are fitted on a SIMULATED corpus, one annotator
- [x] **Name** Wally (D14)

## Non-goals
- **No** rewards or cashback optimisation, multi-merchant comparison, agent-to-agent negotiation (our scope choice, not a statement rule)
- **No** real card issuing, no PAN/CVV handling by software, no live money movement
- **No** minors as the headline; the family budget (a parent's ceiling over a child's budget) is optional
- **No** legal advice; the loss rule is a proposal under the T&C [F2]

## Positioning
| Capability | Others (found) | HKT today (found) | Read |
|---|---|---|---|
| Scoped agent authority | Alipay AI Wallet controls [F9]; Cloudflare allowance + allow list + max transaction [F10]; AP2 mandates [F12] | single-use card made by hand [F1] | catch-up |
| Wallet-level agent controls | Alipay AI Wallet [F9] | none found | catch-up |
| Agent identity | Cloudflare human-readable agent ID [F10]; AP2 credentials [F12] | pilot only [F8] | catch-up |
| Prepaid accounts from age 11 | no bank agent programme found covers it [F7a, F7b] | yes [F2] | HKT edge |
| Seller check at card checkout | none found; Scameter is not wired into checkout [F6] | none found | whitespace |
| Who bears a wrong agent purchase | none found | none found | whitespace |

- **"Not found" is not "absent."** All rows are public sources as of 2026-10-02.
- **Cloudflare Wallets [F10]**: same concept, different rail (stablecoin/x402, APIs and content, merchants must support x402, spending not live at launch). Ours: HK$ card rail, consumer goods, any Mastercard checkout (design target; SIMULATED today), scam-seller gate.
- **Options considered [F43]**: mandate engine (chosen), overnight desk (Track 4, contingency D8), drying/AC tool, signed job receipt, group buy, SME credit ledger.
- **Median competitor**: product compare + card picker, unobserved reward numbers, limit in the prompt, no real stop. They lose E1-E5.

## Glossary
| Term | Meaning |
|---|---|
| **Mandate** | The delegation: plain-language sentence + compiled rules + budget + expiry. Signed as an AgentDelegationCredential (VC 2.0, AP2-shaped [F12]) |
| **Packet** | Sealed decrementing budget derived from the mandate and the log (U1) |
| **Seal** | Delegator signs the mandate with their key |
| **Cart** | Agent-proposed purchase: merchant, items, subtotal, shipping, fees, FX, total |
| **Decision** | Engine output for one cart: APPROVE, DENY or ESCALATE + rule results |
| **Mint** | Create a one-off card whose limit equals the approved total (U2) |
| **Stop** | A DENY, an unanswered ESCALATE, or a revoke; catalogue S1-S6 |
| **Planner** | Untrusted agent: the Laya decision loop (`rule`), one grammar-constrained Qwen answer (`local`) or recorded replay; reads structured listings, never descriptions; may only call `propose_cart` |
| **Judge** | Typed probabilistic gate (Laya local by default, Jev-compatible; or recorded replay); can only tighten a decision. Qwen is never the judge |
| **Compiler** | Turns the mandate sentence into suggested rule chips (Qwen, rule-based fallback); the shopper edits and confirms; it never seals |
| **Policy engine** | Deterministic code that applies R1-R12 and is the only source of a Decision |
| **Rail** | Card issuing layer; SIMULATED, mirrors Single Use Card semantics [F1] |
| **Log / Verifier** | Signed hash-chained decision log / offline page that checks it |
| **Delegator** | The person who seals the packet |
| **Operator** | Whoever runs the Wally software: us in a pilot, the wallet or issuer once it embeds Wally; the log must be checkable without trusting them |
| **Wally** | The product, and the friendly wallet character in the app |
| **Lai see (利是)** | HK red packet: fixed amount, sealed, given once. Pitch analogy only, no longer branding (D14) |
| **Provenance chip** | UI tag showing OBSERVED / SIMULATED / MEASURED / ASSUMED beside every number |
| **App words** | Budget (packet), rules (the compiled mandate), one-off card (a mint), Stopped before paying (a stop), Needs your OK (an escalation), Cancel this budget (revoke), Receipts (log), Proof (verifier). Docs for the team keep the engine terms; table in [04](04-design-language.md) |
| **Family budget** | Optional parent link: a child budget sealed under a parent's (Mum's) credential and never wider, else `EXCEEDS_PARENT`. Mum's key is a demo shortcut held by the booth backend |
| **Pairing token** | LAN mode secret, 128 random bits, new at every server start [F92] |
| **On-device mode** | The page runs the real engine, log and rail-sim with recorded model answers; no server, no network |
| **Ask Wally** | A typed or spoken shopping request: the planner reads it, the rules decide |
