# 01 Product brief

## Delegator
- **Who** (D2): HK Gen Z shopper aged 21-30 [F24], one delegator, one packet.
- **Decision**: whether a proposed cart gets a card.
- **Rail**: SIMULATED, Single Use Card semantics [F1].

## Storyboard
| Attempt | Cart | Outcome | Rule | Left |
|---|---|---|---|---|
| Seal M0 | packet HK$800 [F20] | sealed | R1 | HK$800 |
| 1 | HK$259 [F21] | mint; overshoot declined (limit held), exact charge authorised | all pass; rail `OVER_LIMIT` | HK$541 |
| 2 | seller flagged | stop S2 | R9 | HK$541 [F21] |
| 3 | subtotal HK$520 + HK$30 shipping = HK$550 [F22] | stop S1, no card | R3 | HK$541 [F21] |
| 3b (live) | injected listing | stop S3 | R10 | HK$541 [F21] |
| 4 | HK$120 [F23] | mint | all pass | HK$421 |

Illustrative SIMULATED amounts [F20-F23]; rail and flagged seller SIMULATED.

## Example mandates
- **M0**: "HK$800 this month for clothes, verified sellers only" [F20]. No per-purchase cap, so R3 binds.
- **M1** adaptive cap: M0 plus "no single purchase above half of what is left" [F90].
- **M2** time-boxed, escalation: "HK$800 for clothes over the next 7 days, verified sellers only; ask me above HK$300" [F20, F90].

```
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
| Trigger | Rule ID | UI | Log entry |
|---|---|---|---|
| **S1** Over budget incl. shipping/FX | R3, R4 before mint; R12 + rail decline after mint | `R3.over_remaining`: "Stopped by R3. Total HK$550 is over the HK$541 left." [F21, F22]<br>`R4.over_cap`: {total} over {cap}.<br>`R12.price_drift`: Price moved, {approved} to {seen}. | `DECISION(DENY)`; `CARD_EVENT(DECLINED)` |
| **S2** Flagged or unverified seller | R9 (+ R10 seller score) | `R9.flagged`: Seller flagged ({time}).<br>`R9.unverified`: No record, not proof of safety.<br>`R10.seller_risk`: Seller risk {p} over {T}. | `DECISION(DENY)` or `DECISION(ESCALATE)` |
| **S3** Injected listing text | R10 | `R10.injection`: Injection risk {p} over {T}. | `DECISION(DENY)` |
| **S4** Revocation before mint or first use | R2; rail void | `R2.revoked`: Mandate revoked at {time}. | `MANDATE_REVOKED`, then `DECISION(DENY)` or `CARD_EVENT(VOIDED)` |
| **S5** Escalation expires unanswered | R11 | `R4.ask_above`: {total} over ask_above {x}.<br>`R10.scope`: May be outside {category}.<br>`R11.expired`: No answer in {window}. | `DECISION(DENY)` that resolves an earlier `DECISION(ESCALATE)` |
| **S6** Velocity burst or expired mandate | R7, R2 | `R7.velocity`: {n} mints in {window}.<br>`R2.expired`: Mandate expired at {time}. | `DECISION(DENY)`; `PACKET_EXPIRED` |

Banner = "Stopped by R<n>." + fragment; ESCALATE reads "Escalated by R<n>."; {x} = recorded input. EN template text; rendering in [02](02-architecture.md) §8. Rail SIMULATED.

## Loss rule v0
| Cause | Bears the loss | Route |
|---|---|---|
| Within the mandate, approved by the recorded rule | Delegator | Refund, then dispute |
| Outside the mandate (breach proven by the log) | Operator | Reimburse; log is the proof |
| Merchant non-delivery | Merchant | Refund, then dispute |
| Injected listing that passed the judge | Operator | Reimburse; judge scores logged |
| Rail or issuer error | Open | SIMULATED today; ask HKT ([09](09-hkt-delegation-api-ask.md)) |

- **Refund** only via the merchant [F2]; **dispute** within 60 days [F2]; fee HK$150 [F3] follows the loss (delegator advances it in merchant cases).
- **Max exposure**: the sealed packet, by construction (I2, R3).
- *Proposal, not legal advice; Tap & Go T&C govern [F2].*

## Teen extension
- **Chain**: parent → teen → agent; caps compose: agent <= teen packet <= parent funding.
- **Ages**: Plus(ii) is 11-17 [F2].
- **Priority**: cut first (D9), not the headline (D2).

## Traceability
| Requirement | Feature | Test ID | Demo ID |
|---|---|---|---|
| SR1 scope | one packet, `core` packet math | T-E2E | DM2 |
| SR2 rules enforced | R1-R12 engine; MandateEditor | T-I1, T-I2, T-I6 | DM1 |
| SR3 end to end | `core` orchestrator, `rail-sim` | T-E2E, T-R1 | DM2, DM6 |
| SR4 a stop | S1-S6, StopBanner | T-S1, T-S2, T-S3 | DM3 |
| E1 log | signed hash-chained log, LogTimeline | T-I7 | DM1, DM7 |
| E2 stopped | StopBanner, SIMULATED rail decline | T-S1 … T-S6, T-H1 | DM2, DM3, DM4, DM5 |
| E3 manual route | `harness` comparison, EvidenceCharts | T-H3 | DM8 |
| E4 decision rule | rule templates, DecisionCard | T-S1, T-I7 | DM1, DM4, DM7 |
| E5 observed values | provenance chips, capture sheet | T-H3, T-R1 | DM8 |

- **DIR map**: 1 MandateEditor; 2 R4; 3 R2; 4 S1; 5 S4; 6 S5; 7 log + verifier; 8 rule templates; 9 S3; 10 harness; 11 loss rule.
