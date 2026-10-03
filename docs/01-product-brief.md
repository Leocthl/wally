# 01 Product brief

## Delegator
- **Who** (D2): HK Gen Z shopper aged 21-30 [F24], one delegator. **Decision**: whether a proposed cart gets a card. **Rail**: SIMULATED, Single Use Card semantics [F1].
- **Words**: the app says budget, rules, one-off card (D14); this file keeps engine terms ([04](04-design-language.md)).

## Who pays and what it becomes
- **Customer**: a wallet or issuer that embeds Wally as delegate controls plus proof; the shopper pays nothing (ASSUMED [F98]).
- **Revenue guess**: a fee per active budget, or basis points on agent volume (ASSUMED [F98]).
- **Wedge**: Hong Kong prepaid wallets, then card rails through the RailPort ([09](09-hkt-delegation-api-ask.md)).
- **Anchors**, not Hong Kong figures: Alipay AI Pay, over 120 million transactions in one week [F94]; McKinsey, US$3 to 5 trillion of agentic commerce revenue by 2030 [F95].

## Who does what
| Player | Rail token | Budget limit | Signed budget | Offline proof | Injection screen | Any rail |
|---|---|---|---|---|---|---|
| AP2 [F12] | ● | ● | ● | ◐ | ○ | ● |
| Visa [F7b] | ● | ● | ◐ | ○ | ○ | ◐ |
| Mastercard [F7a] | ● | ◐ | ◐ | ◐ | ○ | ◐ |
| Cloudflare [F10] | ● | ● | ○ | ○ | ○ | ◐ |
| Alipay [F9] | ○ | ◐ | ○ | ○ | ○ | ○ |
| OpenAI, Stripe | ● | ◐ | ○ | ○ | ○ | ◐ |
| HKT card [F1] | ● | ◐ | ○ | ○ | ○ | ○ |
| Wally | ◐ | ● | ● | ● | ◐ | ◐ |

- ● found, ◐ partial or draft, ○ not found, in public pages read 2026-10-03 [F103]. Wally: rail SIMULATED, any rail design, delegator key a demo shortcut.

## Storyboard
| Attempt | Cart | Outcome | Rule | Left |
|---|---|---|---|---|
| Seal M0 | HK$800 [F20] | sealed | R1 | HK$800 |
| 1 | HK$259 [F21] | mint; overshoot, replay declined | pass; rail `OVER_LIMIT`, `CARD_USED` | HK$541 |
| 2 | HK$180, seller flagged [F28] | stop S2 | R9 | HK$541 |
| 3 | HK$520 + HK$30 shipping = HK$550 [F22] | stop S1, no card | R3 | HK$541 |
| 3b (live) | HK$150, injected listing [F28] | stop S3 | R10 | HK$541 |
| 4 | HK$120 [F23] | mint | all pass | HK$421 |

Amounts [F20-F23], rail and flagged seller: SIMULATED.

## Flows
- **Seal** · **Ask Wally** (type or speak) · **Cheaper options** after an R3 or R4 stop · **Needs your OK** within the window [F31] · **Cancel this budget** (signed revoke) · **Receipts, Proof** (`verifyChain`).

## Example mandates
- **M0** is the demo budget [F20], so R3 binds; **M1** and **M2** are variants [F90].

```
all R1 proof = AgentDelegationCredential (VC 2.0), issuer = delegator did:key, signed at Seal
M0  R3 budget = HK$800 [F20]
    R2 expiry = month end
    R6 category = clothes
    R9 sellers = verified only
M1  M0 chips, plus
    R4 cap = half of remaining [F90]
M2  R3 budget = HK$800 [F20]
    R2 expiry = 7 days from seal [F90]
    R6 category = clothes
    R9 sellers = verified only
    R4 ask_above = HK$300 [F90]
    R11 window = 60 s [F31]
```

## Stop catalogue
| Trigger | Rules | Template IDs |
|---|---|---|
| **S1** Over budget, shipping included | R3, R4 before mint; R12, rail decline after | `R3.over_remaining`, `R4.over_cap`, `R12.price_drift` |
| **S2** Flagged or unverified seller | R9, R10 | `R9.flagged`, `R9.unverified`, `R10.seller_risk` |
| **S3** Injected listing text | R10 | `R10.injection` |
| **S4** Revoked before mint or use | R2; rail void | `R2.revoked` |
| **S5** Escalation unanswered | R11 | `R4.ask_above`, `R10.scope`, `R11.expired` |
| **S6** Velocity burst, expired mandate | R7, R2 | `R7.velocity`, `R2.expired` |

- **Banner** = "Stopped by R<n>." + recorded inputs, e.g. "Total HK$550 is over the HK$541 left." [F21, F22]. Rendering: [02](02-architecture.md) §8.

## Loss rule v0
| Cause | Bears the loss |
|---|---|
| Within the mandate, approved by the recorded rule | Delegator |
| Breach proven by the log, or an injected listing the judge passed | Operator (whoever runs the Wally software) |
| Merchant non-delivery | Merchant |
| Rail or issuer error | Open: ask HKT ([09](09-hkt-delegation-api-ask.md)) |

- **Route**: refund only via the merchant, dispute within 60 days [F2]; fee HK$150 follows the loss [F3]. **Max exposure**: the sealed packet (I2, R3). *Proposal, not legal advice; Tap & Go T&C govern [F2].*

## Family budget
- **Chain** (optional, D17): Mum's ceiling HK$1,000 caps a child's HK$800; a HK$1,500 ask is refused `EXCEEDS_PARENT` [F93]. A child only narrows the parent's rules.
- **Limits**: the offline page cannot check the parent link; Mum's key is a demo shortcut. Minors are not the headline (D2).

## Traceability
| Requirement | Feature | Test ID | Demo ID |
|---|---|---|---|
| SR1 scope | packet math | T-E2E | DM2 |
| SR2 rules enforced | R1-R12 engine, Seal | T-I1, T-I2, T-I6 | DM1 |
| SR3 end to end | orchestrator, `rail-sim` | T-E2E, T-R1 | DM2, DM6 |
| SR4 a stop | S1-S6, Stopped screen | T-S1, T-S2, T-S3 | DM3 |
| E1 log | signed log, Receipts | T-I7 | DM1, DM7 |
| E2 stopped | Stopped screen, rail decline | T-S1 … T-S6, T-H1 | DM2, DM3, DM4, DM5 |
| E3 manual route | harness, Why trust Wally | T-H3 | DM8 |
| E4 decision rule | templates, Why sheet | T-S1, T-I7 | DM1, DM4, DM7 |
| E5 observed values | chips, capture sheet | T-H3, T-R1 | DM8 |
