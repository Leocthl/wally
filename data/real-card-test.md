# Real-card test

Protocol: [docs/05-evidence-plan.md](../docs/05-evidence-plan.md#real-card-test). The card holder types their own card. The aim is a decline, never a completed payment.

## Setup
| field | value |
|---|---|
| account type (Plus(ii) or Pro) | |
| holder (initials) | |
| card typed by (initials; must equal the holder) | |
| merchant (from the shop probe sheet) | |
| test total shown on the payment page (HKD) | |
| limit set on the Single Use Card (HKD) | |
| limit below total (if no, stop) | yes / no |
| date and time (UTC+8) | |

## Result
| field | value |
|---|---|
| decline code (or "none shown") | |
| decline message (verbatim) | |
| where the decline showed (checkout page / app / both) | |
| decline timestamp (UTC+8) | |
| seconds from submit to decline (MEASURED(1); one sample, no distribution claim) | |
| merchant pre-authorisation above the final charge [F2.preauth] | seen / not seen / unknown |
| hold shown in the app | yes / no / unknown |
| entry in Tap & Go history | yes / no |
| card afterwards | voided / expired / still active |
| payment completed (must be no) | |
| anything unexpected (challenge, redirect, second prompt) | |

## Checklist
- [ ] Holder typed the card; no other person and no software saw PAN, CVV or expiry [F2.secrecy]
- [ ] No PAN, CVV or expiry in notes, screenshots, clipboard or chat (I8)
- [ ] Total re-checked on the payment page right before submit; limit below it
- [ ] One attempt; stopped at the first decline
- [ ] Screenshot masked before saving; raw file in `data/raw/` only
- [ ] Capture-sheet row added; register rows F1 and F2 promoted if the app showed new values

## Mapping to rail-sim
- **Codes** come from [docs/02-architecture.md](../docs/02-architecture.md) §10. Only `OVER_LIMIT` is calibrated by this test; the other codes stay SIMULATED. If the observed decline fits none, add a row and tell Lane A.

| observed (code / message) | meaning | rail-sim decline code | parity (match / differs) |
|---|---|---|---|
| EXAMPLE, delete | amount above the card limit | `OVER_LIMIT` | match / differs |
| | card already used | `CARD_USED` | SIMULATED, no real record |
| | card voided | `CARD_VOIDED` | SIMULATED, no real record |
| | card expired | `CARD_EXPIRED` | SIMULATED, no real record |
| | card not recognised | `UNKNOWN_HANDLE` | SIMULATED, no real record |
| | merchant refusal or challenge | none (not simulated) | note in the record |

- **T-R1** passes when rail-sim returns the same decline class, and the same timing shape (immediate or deferred), as the record above.
