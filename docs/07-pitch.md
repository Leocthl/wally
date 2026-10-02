# 07 Pitch

## Talk track
| Block | Booth [F45] | Finalist [F70] | Say |
|---|---|---|---|
| Hook | 0:00-0:25 | 0:00-1:00 | 12,505 online shopping scams in Hong Kong in 2025 [F4]; six in ten victims were 11 to 30 [F5c]. Now give them an AI agent with a wallet. A lai see is fixed, sealed, given once. We built it for AI, and it checks the shop before it pays. Finalist adds the gap: bank and issuer pilots, none found for prepaid wallets or teens [F7a, F7b]. |
| Seal + mint | 0:25-1:05 | 1:00-2:15 | You seal a packet, "HK$800, clothes, verified sellers" [F20], signed as a delegation credential. The agent can only ask. Laya, on this laptop, picks the item; every pick is logged. An approved cart gets a simulated single-use token for the exact total, shipping included [F1]. Charge more: declined. Charge twice: declined. |
| Three stops | 1:05-2:10 | 2:15-3:30 | Seller flagged: the token never exists. Over budget by HK$9 once shipping lands [F22]: stopped by R3. Orders hidden in the listing: the judge scores them, the engine stops them. Try to trick it yourself. |
| Proof | 2:10-2:40 | 3:30-4:15 | Every decision is signed. Flip one byte and verification fails. In n replayed scenarios a model-only gate overspent [X] percent. Ours: [Y]. |
| Limits + ask | 2:40-3:00 | 4:15-5:00 | The rail is simulated. Laya is a third-party open-source model on this Mac. Every number comes from our harness. HKT has the wallet, the card and an agent-ID pilot [F1, F2, F8]; we found no delegation API [F1]. Here is our one-page ask. |

- **Then**: 2 min Q&A or hands-on [F45]; finalists 2 min Q&A [F14]. Choreography: [06](06-demo-script.md).
- **Brackets are silent**: n, [X] = B0 and [Y] = B2 overspend, MEASURED(n) from `packages/harness` (T-H3). No claims about LLM or prompt-only agents.

## Slides
| # | One idea | Shows |
|---|---|---|
| 1 | Scale | 12,505 cases in 2025 [F4]; six in ten victims aged 11-30 [F5c] |
| 2 | Gap | No agent pilot found for prepaid wallets or teens [F7a, F7b] |
| 3 | Thesis | Lai see for AI: fixed, sealed, given once |
| 4 | Seal | Sentence → rule chips → signed credential (M0) |
| 5 | Mint | Exact-total token; HK$800 → HK$541 left [F20, F21]; replay blocked |
| 6 | Stops | R9 flagged seller, R3 over budget, R10 injected listing |
| 7 | Proof | Signed log; one flipped byte fails verification |
| 8 | Numbers | Harness B0, B1, B2 and manual route, MEASURED(n) |
| 9 | Honesty | Real, third-party, simulated, assumed; who holds the loss |
| 10 | Ask | One-page delegation API and rail portability: proposal, not a commitment |

## Scoring map [F15]
| HKT criterion | Weight | Where we show it |
|---|---|---|
| Problem-solution fit | 25 | one decision, one delegator; E1-E5; three live stops |
| Technical execution | 25 | pure engine R1-R12, Laya decision loop with a logged trace, harness, verifier |
| UX, Gen Z | 20 | booth a judge drives; sealed packet; EN + zh-HK UI |
| Security and trust | 15 | delegation credential, escalation as consent, signed log, fail closed, blocked replay, no duplicate charge [F19] |
| Rail feasibility | 15 | Single Use Card semantics [F1]; RailPort portability table (09) |

## Hard Q&A
| Question | Answer |
|---|---|
| Is the judge model yours? | No: third-party open source (Convai Innovations, Apache-2.0) [F11c], credited, on this Mac. Ours: the questions, rotation averaging, thresholds fitted on our harness, the code around it; latency MEASURED [F26]. |
| Did AI write your code? | Allowed [F16]; we explain every module. Crib: credential → planner (Laya decision loop) → judge (Laya typed questions) → engine R1-R12, sole producer of decisions → signed log → SIMULATED rail ([02](02-architecture.md)). |
| What if the judge is wrong? | It only tightens (I3). A false allow still meets hard rules R1-R8, R12 and the rail limit, which use no model; errors and truncated input escalate; false-allow rate from the harness. |
| Planner and judge, same model? | Yes, so errors can correlate; that is why the rules and the rail limit are model-free. |
| Cloudflare, Visa, Mastercard, Alipay? | Cloudflare: x402 rail, merchants must support it [F10]. Card pilots run through banks and issuers [F7a, F7b]; Alipay has single-use authorisation [F9]. Not found elsewhere: a seller check at card checkout, a stated loss rule. |
| Real or simulated? | Rail SIMULATED, no issuing API found [F1]; one human-typed decline calibrates it [F40]. |
| Who pays? | Loss rule v0 ([01](01-product-brief.md)): delegator inside the mandate, operator on a logged breach, merchant on non-delivery; dispute fee HK$150 [F3]; capped at the packet. |
| Why not a card limit? | A Single Use Card limit is set by hand [F1] and knows nothing of seller, category or packet. Ours sizes each mint to the cart (I2) and cites a rule per stop. |
| Agent lies about the total? | It cannot mint (I4); arithmetic is code; the limit equals the approved total (I2); R12 voids on drift. |
| No Scameter record? [F6] | Not safe [F6]. R9 escalates an unverified seller; unanswered, R11 denies [F31]. |
| Log edited? | Signed, hash-chained; the offline verifier names the first failing entry (T-V1). |

## Honesty slide
| Status | What |
|---|---|
| **Real** | Engine, credential, signed log, verifier, Laya calls; public facts read 2026-10-02, still READ-BY-CLAUDE |
| **Third-party** | Laya, open source, on this Mac [F11c]; credited |
| **Simulated** | Rail and merchant lock (Single Use Card semantics [F1]), merchants, flagged seller, amounts [F20-F23] |
| **Shortcut** | The web API holds the delegator demo key; production keeps it on the device |
| **Limits** | Laya cannot read raw pages, do arithmetic or write text; one model plans and judges, so rules and the rail limit are model-free |
| **Assumed** | Judge thresholds [F36], token TTL [F30], escalation window [F31] |

- **Measured**: numbers from our harness only, MEASURED(n); vendor figures stay VENDOR-REPORTED [F11c].
- **Not affiliated** with HKT, Tap & Go or Mastercard. No logos.

## Before the pitch
- [ ] Re-capture cited READ-BY-CLAUDE facts; fill n, [X], [Y] or cut the line
