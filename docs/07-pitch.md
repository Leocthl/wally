# 07 Pitch

## 60-second pitch
| Time [F91] | Say |
|---|---|
| 0:00 | 12,505 online shopping scams in Hong Kong in 2025 [F4]. Six in ten victims were between 11 and 30 [F5c]. |
| 0:07 | Now give them an AI agent with a wallet. The Visa and Mastercard pilots run through banks and issuers [F7a, F7b]. None we found cover prepaid wallets or teens. |
| 0:17 | Hong Kong knows a safe way to hand over money: the lai see. Fixed. Sealed. Given once. We built it for AI. It checks the shop before it pays. |
| 0:29 | You seal a packet: "HK$800, clothes, verified sellers" [F20]. The agent can only ask. An approved cart gets a simulated Tap & Go Single Use Card, minted for the exact total, shipping included [F1]. Seller flagged, over budget: the card never exists. |
| 0:43 | Every decision is signed. Flip one byte of the log and verification fails. In n replayed scenarios, a prompt-only agent overspent [X] percent. Ours: [Y]. |
| 0:53 | HKT has the wallet, the card and an agent-ID pilot [F1, F2, F8]. We found no delegation API [F1]. Here is our one-page ask. |

Brackets are silent. 60 s [F42]. From `packages/harness` only, MEASURED(n) with seed and commit (T-H3): n = scenarios, [X] = B0 overspend, [Y] = B2 overspend.

## 5-minute run-of-show
| Segment | Seconds [F42] | Demo moments | Slides |
|---|---|---|---|
| Hook + thesis | 60 | none | 1-3 |
| Mandate → buy | 75 | DM1, DM2 | 4-5 |
| Three stops | 75 | DM3, DM4, DM5 | 6 |
| Proof + numbers | 45 | DM6, DM7, DM8 | 7-8 |
| Where it breaks | 30 | DM9 | 9 |
| Path to HKT | 15 | DM9 | 10 |

Total 300 s [F42]; slot ASSUMED [F14]. DMR1, DMR2: Q&A reserves. Choreography: [06](06-demo-script.md).

## Slides
| # | One idea | Shows |
|---|---|---|
| 1 | Scale | 12,505 cases in 2025 [F4]; six in ten victims aged 11-30, Jan-Nov 2025 [F5c] |
| 2 | Gap | Bank and issuer pilots; none we found cover prepaid wallets or teens [F7a, F7b] |
| 3 | Thesis | Lai see for AI: fixed, sealed, given once |
| 4 | Seal | Sentence → compiled rule chips (M0) |
| 5 | Mint | Approved cart → exact-total card; illustrative HK$800 → HK$541 left [F20, F21] |
| 6 | Stops | R9 flagged seller, R3 over budget, R10 injected listing |
| 7 | Proof | Signed log; one flipped byte fails verification |
| 8 | Numbers | Harness B0, B1, B2 and manual route, MEASURED(n) |
| 9 | Honesty | Real, simulated, assumed, unknown; who holds the loss |
| 10 | Ask | One-page delegation API: proposal, not a commitment |

- **Format**: 16:9, one idea per slide, design in [04](04-design-language.md).

## Hard Q&A
| Question | Answer |
|---|---|
| Cloudflare? [F10] | Same idea on a stablecoin/x402 rail; merchants must support x402, spending not live at launch [F10]. Ours: HK$ card rail (SIMULATED today), consumer goods, seller check. |
| Visa and Mastercard? [F7a, F7b] | Pilots run through banks and issuers; none we found is a stored-value wallet [F7b]. `RailPort` lets the engine swap the SIMULATED rail for a real one. |
| Alipay? [F9] | Alipay AI Pay (mainland) has single-use authorisation and an AI Wallet [F9]: catch-up for HKT. Not found elsewhere: a seller check at card checkout, a stated loss rule. |
| What if Jev is wrong? | The judge only tightens: APPROVE to DENY or ESCALATE (I3). A false allow still meets hard rules R1-R8, R12. Its false-allow rate comes from the harness. |
| Real or simulated? | The rail is SIMULATED; no issuing API found [F1]. Engine, log and verifier are real code. One human-typed real decline calibrates the simulator if that test ran [F40]; if not, sim-only. |
| Who pays? | Loss rule v0 ([01](01-product-brief.md)): delegator inside the mandate; operator on a logged breach or missed injection; merchant on non-delivery, via refund or dispute within 60 days [F2], fee HK$150 [F3]. Capped at the packet. Proposal, not legal advice. |
| Minors? | Not the headline: default delegator is aged 21-30 [F24]. Teen extension (Plus(ii), 11-17 [F2]) chains parent → teen → agent with composing caps; cut first (D9). |
| Why not set a card limit? | A Single Use Card limit is set by hand, per card [F1]; it knows nothing of seller, category or packet remaining. Ours sizes each mint to the cart (I2) and cites a rule per stop. |
| Agent lies about the total? | The planner cannot mint (I4). The card limit equals the approved total (I2), so a higher checkout total is declined by the SIMULATED rail; R12 voids approval on price drift. |
| No Scameter record? [F6] | No record is not safe [F6]. R9 turns an unverified seller into ESCALATE, not an automatic APPROVE; unanswered, R11 denies after the window [F31]. Lookups are manual, timestamped captures; no terms on automated use found [F6]. |
| Log edited? | Entries are signed (Ed25519) and hash-chained (SHA-256). The offline verifier needs only the entries, public keys and a head checkpoint, and names the first failing entry; the demo flips one byte (T-V1). |
| Why not a stablecoin wallet? | x402 needs merchant support [F10]; we hold no x402 measurement. Our shop probe measures card acceptance on 10 HK stores [F39]. `RailPort` allows swapping the SIMULATED rail. |

## Honesty slide
| Status | What |
|---|---|
| **Real** | Engine, signed log, verifier, planner and judge calls; public facts read 2026-10-02, still READ-BY-CLAUDE |
| **Simulated** | Rail (Single Use Card semantics [F1]), merchants, flagged-seller fixture, storyboard amounts [F20-F23], delegator demo key held by the web API |
| **Assumed** | Judge thresholds [F36], card TTL [F30], escalation window [F31] |
| **Unknown** | Prizes and judging [F15], pre-existing code rule [F16], HKT API roadmap [F17], Jev key access [F11b] |

- **Measured**: only our harness results, MEASURED(n); vendor figures stay VENDOR-REPORTED [F11].
- **Not affiliated** with HKT, Tap & Go or Mastercard. No logos.

## Before the pitch
- [ ] Re-capture cited READ-BY-CLAUDE facts, timestamped
- [ ] Fill n, [X], [Y] from harness, or cut the line
