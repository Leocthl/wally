# 00 Context

## Event
- **HacKU 2026**: HKU Computer Science Association, 48h inter-university hackathon, HKU Main Campus [F13]
- **Track**: FinTech, "Give a Machine a Wallet - Agentic Commerce" (HKT-sponsored)
- **Showcase**: 2026-10-04, pitching round 16:00-17:30 [F14], closing ceremony 18:00-19:00 [F13]
- **Unknown**: per-team pitch length [F14], prizes and judging weights [F15], pre-existing code rule [F16], HKT sandbox access [F17]. The track title and HKT sponsorship are on no public page we read; they come from the team's track statement [F17]
- **Product**: Lai See Agent (利是 Agent), a sealed-budget mandate engine for AI shopping agents. Not affiliated with HKT, Tap & Go or Mastercard

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
- **Out of scope**: rewards optimisation, multi-merchant comparison, agent-to-agent negotiation

## Decisions
| ID | Decision | Alternative recorded in |
|---|---|---|
| D1 | Mandate engine on HKT rails + four upgrades (D6). Title "Lai See Agent"; red-packet metaphor is branding only, the technical plan must not depend on it | none |
| D2 | Delegator: HK Gen Z shopper [F24] seals a monthly clothing packet [F20] and delegates apparel buying from shop links. Option: teen on Plus(ii) [F2] with a parent-sealed packet (parent → teen → agent, caps compose: agent <= teen packet <= parent funding). Minors are not the headline | ADR-0005 |
| D3 | Chain: signed mandate → planner (Claude, untrusted) → judge (Jev, veto/escalate only) → policy engine (deterministic) → rail (SUC semantics) → merchant. Every decision → signed hash-chained log → offline verifier | ADR-0002 |
| D4 | Invariants I1-I8 (below). Explanations render from rule templates + recorded inputs, never LLM prose | ADR-0002 |
| D5 | Jev is a typed probabilistic gate, not the agent. Fallback provider with the same schema, shadow mode first, report only latency and cost we measure | ADR-0001 |
| D6 | Upgrades: U1 decrementing sealed packet; U2 mint-on-approval; U3 seller-risk gate before minting; U4 rail simulator calibrated on one real decline + 10-shop readiness probe | ADR-0003 |
| D7 | No issuing API found [F1]: rail is SIMULATED and labelled so everywhere. A processed payment cannot be cancelled [F2]: demo revocation before mint or before first use; after payment use dispute + loss rule | ADR-0003 |
| D8 | Contingency only: if the H10 trigger fires [F41], switch to Track 4 "overnight desk that escalates" | 08 |
| D9 | Cut order, first to go: teen chain, screenshot intake (stretch, only if under 2 h), reconciliation, did:key (keep Ed25519), harness 200 → 100 [F37], Scameter → manual capture only | 03 |
| D10 | First-2-hour kill tests: real-card decline [F40]; shop probe [F39]; ask an HKT mentor whether a delegate SUC API is planned [F17] | 03, 05 |

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
| R10 | Judge thresholds [F36, F50, F51]: injection, scope fit, seller risk, escalate_or_proceed | DENY or ESCALATE |
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
| Card state | `ACTIVE`, `USED`, `VOIDED`, `EXPIRED` |
| Packet status | `ACTIVE`, `EXHAUSTED`, `EXPIRED`, `REVOKED` |
| Escalation state | `OPEN`, `APPROVED`, `DENIED`, `EXPIRED` |
| Judge questions | `scope_fit`, `injection_risk`, `seller_risk`, `escalate_or_proceed` |
| Judge provider | `jev`, `llm` |
| Money | integer minor units (HKD cents), currency `HKD` |

### Pipeline contract v0
```
seal      Delegator signs Mandate → log MANDATE_SEALED → PacketState (folded from the log)
propose   Planner (untrusted; only tool: propose_cart) → Cart
assess    judge.assess(cart, listing, scameterCapture) → JudgeRecord               // Jev or llm fallback; never throws, status OK | TIMEOUT | ERROR
decide    engine.decide(mandate, packet, cart, judgeResult, now) → Decision       // pure, deterministic, R1-R12
record    log.append(DECISION)                                                     // I7, before any side effect
mint      on APPROVE: rail.mint(limit = cart.total, ttl) → CardRecord; log.append(CARD_MINTED)
escalate  on ESCALATE: open escalation; delegator resolves or window ends → R11
checkout  executor (deterministic code, never the planner) presents the card handle to the merchant stub;
          rail.authorise → log.append(CARD_EVENT); planner sees status only, never PAN/CVV (I8)
revoke    Delegator signs revoke → log MANDATE_REVOKED → rail.void(unused cards) → CARD_EVENT(VOIDED)
verify    verifyChain(entries, publicKeys, headCheckpoint) → pass | first failing seq
```
- **Ports in `core`**: `PlannerPort`, `JudgePort`, `RailPort`, `LogStore`, `Clock`, plus a `Signer`. `agent` and `rail-sim` implement them, `apps/web` composes. No package cycles. Exact signatures: 02 §18.
- **Packet accounting**: commit on mint, release on `VOIDED`/`EXPIRED`, settle on `AUTHORISED` with the actual amount (difference released).
- **Judge runs in parallel with preflight (R1-R8)** to save latency. The engine is the only producer of a Decision.

### Packages and lanes
| Lane | Scope | Paths (npm scope `@laisee/*`) |
|---|---|---|
| A | policy + rail | `packages/core` (schemas→types, packet math, R1-R12, engine, crypto, log, orchestrator), `packages/rail-sim` |
| B | agent + Jev | `packages/agent` (planner, judge adapters jev + llm, shadow mode) |
| C | UI + verifier | `apps/web` (UI + thin API), `apps/verifier` (offline page) |
| D | evidence + pitch | `packages/harness`, `data/`, `docs/05`-`07`, `docs/09` |
| X | cross-lane | `schemas/`, fixtures in `data/fixtures/`, CI |

### Canonical demo (storyboard in 01, choreography in 06)
| ID | Moment | Covers |
|---|---|---|
| DM1 | Seal mandate M0: sentence → compiled rule chips → Seal. M0 has no separate per-purchase cap, so R3 is the binding rule | SR2, E1, E4 |
| DM2 | Attempt 1: mint HK$259 [F21]; packet meter shows HK$541 left. Overshoot beat on the live card: merchant stub in `overshoot` mode charges above the quote, rail declines `OVER_LIMIT` (limit held, S1 rail variant, SIMULATED); then the exact charge is authorised | SR1, SR3, E2 |
| DM3 | Attempt 2: seller flagged, stopped by R9 (S2); the card never exists | SR4, E2 |
| DM4 | Attempt 3: HK$550 [F22] > HK$541 left, stopped by R3 (S1); no card exists | E2, E4 |
| DM5 | Attempt 3b: injected listing text, stopped by R10 (S3) | E2, DIR9 |
| DM6 | Attempt 4: mint HK$120 [F23] (optional, cut first if short on time) | SR3 |
| DM7 | Log timeline + verifier; flip one byte, verification fails | E1, E4, DIR7 |
| DM8 | Evidence: harness B0/B1/B2, manual-route comparison, provenance chips | E3, E5, DIR10 |
| DM9 | Where it breaks, who holds the loss, path to HKT | DIR11 |
| DMR1 | Reserve: revoke before first use, hold to confirm (S4) | DIR5 |
| DMR2 | Reserve: escalation expires unanswered (S5) | DIR6 |

- **Run-of-show [F42]**: hook + thesis; mandate → buy (DM1-DM2); three stops (DM3-DM5); proof + numbers (DM6-DM8); where it breaks (DM9); path to HKT.
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
- **Not affiliated with HKT.** No logos, no lookalike branding.

## Assumptions to confirm
- [ ] **Team** is 3-4 and writes TypeScript; at least one member reads zh-HK for copy review
- [ ] **Someone holds** a Tap & Go Plus(ii) or Pro account (needed for the real-card test and F1 re-capture)
- [ ] **Jev key** available or obtainable in the first hour; otherwise fallback provider only [F41]. Access is waitlisted and no hackathon credits were found [F11b]
- [ ] **Jev data**: only public listing text and cart fields go to a US-hosted vendor, never PAN/CVV or personal data (I8) [F11b]
- [ ] **Scameter**: manual, human-paced captures only. No terms on automated use were found and the Important Notice limits reproduction [F6]. The engine reads captures and never queries live
- [ ] **Dates**: no Mastercard or Visa announcement date goes on a slide until re-captured [F7a, F7b]
- [ ] **Pitch slot** about 5 min [F14]; prize structure unknown [F15]
- [ ] **Pre-existing code** rule: we start from an empty repo; open-source libraries are fine until told otherwise [F16]
- [ ] **HKT** mentor or sandbox reachable at the venue [F17]
- [ ] **Anthropic API key** and budget for planner and fallback judge calls
- [ ] **Rail is SIMULATED**; the judges accept this when labelled and calibrated on one real decline
- [ ] **Demo stops** are S2, S1, S3 live; thresholds [F36] and the HK$800 storyline [F20-F23] are the lead's defaults
- [ ] **Name** "Lai See Agent" is acceptable to all

## Non-goals
- **No** rewards or cashback optimisation, multi-merchant comparison, agent-to-agent negotiation
- **No** real card issuing, no PAN/CVV handling by software, no live money movement
- **No** minors as the headline; teen chain is an extension that is cut first
- **No** legal advice; the loss rule is a proposal under the T&C [F2]

## Positioning
| Capability | Others (found) | HKT today (found) | Read |
|---|---|---|---|
| Scoped agent authority | Alipay single-use authorisation [F9]; Cloudflare allowance + allow list + max transaction [F10]; AP2 mandates [F12] | single-use card made by hand [F1] | catch-up |
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
| **Mandate** | Signed delegation (AP2-shaped [F12]): plain-language sentence + compiled rules + budget + expiry |
| **Packet** | Sealed decrementing budget derived from the mandate and the log (U1) |
| **Seal** | Delegator signs the mandate with their key |
| **Cart** | Agent-proposed purchase: merchant, items, subtotal, shipping, fees, FX, total |
| **Decision** | Engine output for one cart: APPROVE, DENY or ESCALATE + rule results |
| **Mint** | Create a one-off card whose limit equals the approved total (U2) |
| **Stop** | A DENY, an unanswered ESCALATE, or a revoke; catalogue S1-S6 |
| **Planner** | Untrusted Claude agent; may only call `propose_cart` |
| **Judge** | Typed probabilistic gate (Jev, or LLM fallback); can only tighten a decision |
| **Policy engine** | Deterministic code that applies R1-R12 and is the only source of a Decision |
| **Rail** | Card issuing layer; SIMULATED, mirrors Single Use Card semantics [F1] |
| **Log / Verifier** | Signed hash-chained decision log / offline page that checks it |
| **Delegator** | The person who seals the packet |
| **Operator** | Whoever runs the engine (us); the log must be checkable without trusting them |
| **Lai see (利是)** | HK red packet: fixed amount, sealed, given once |
| **Provenance chip** | UI tag showing OBSERVED / SIMULATED / MEASURED / ASSUMED beside every number |
