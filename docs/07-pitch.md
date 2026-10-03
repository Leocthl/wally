# 07 Pitch

## Talk track
| Block | Booth [F45] | Finalist [F70] | Say |
|---|---|---|---|
| Hook | 0:00-0:25 | 0:00-1:00 | 12,505 online shopping scams in Hong Kong in 2025 [F4]; six in ten victims were 11 to 30 [F5c]. Now give them an AI agent with a wallet. Meet Wally: a signed budget it cannot overspend, and it checks the shop before it pays. Finalist adds: bank and issuer pilots, none found for prepaid wallets or teens [F7a, F7b]. |
| Seal + one-off card | 0:25-1:05 | 1:00-2:15 | One sentence, "HK$800, clothes, verified sellers" [F20]; Wally turns it into rules you check and sign. It can only ask. Two models run on this laptop: Qwen picks the item (About names the planner), Laya judges the listing. An approved cart gets a one-off card for the exact total, shipping included [F1]. Charge more: declined. Use it twice: declined. |
| Three stops | 1:05-2:10 | 2:15-3:30 | Seller flagged: no card exists. Over budget by HK$9 once shipping lands [F22]: stopped before paying. Orders hidden in the listing: Laya scores them, the rules stop them. Unsure: Needs your OK, and a yes never overrides a fixed rule. Try to trick it yourself. |
| Proof | 2:10-2:40 | 3:30-4:15 | Every decision is a signed receipt; flip one byte and Proof fails. In 150 replayed scenarios a model-only gate overspent in 6.0 percent and let 43 of 84 traps through [F69]. Ours: none, and none [F69]. |
| Limits + ask | 2:40-3:00 | 4:15-5:00 | The rail is simulated. Both models are third-party open source on this Mac. Every number is from our harness. HKT has the wallet, the card and an agent-ID pilot [F1, F2, F8]; we found no delegation API [F1]. |

- **Then**: Q&A or hands-on [F45]; finalists Q&A [F14]; see [06](06-demo-script.md).
- **Model-only gate** = our B0 baseline: Laya trusted, no arithmetic, no card limit. No claims about LLM agents.

## Slides
| # | One idea | Shows |
|---|---|---|
| 1 | Scale | 12,505 cases in 2025 [F4]; six in ten victims aged 11-30 [F5c] |
| 2 | Gap | No agent pilot found for prepaid wallets or teens [F7a, F7b] |
| 3 | Thesis | Wally: a budget an AI cannot overspend |
| 4 | Seal | Sentence → rules → signed credential |
| 5 | One-off card | Exact-total card; HK$800 → HK$541 [F20, F21]; replay blocked |
| 6 | Stops | Flagged seller, over budget, listing orders, Needs your OK |
| 7 | Proof | Signed receipts; one flipped byte fails |
| 8 | Numbers | B0, B1, B2 on 150 scenarios [F69] |
| 9 | Honesty | Real, simulated, shortcut, limits |
| 10 | Ask | Delegation API, rail portability |

## Scoring map [F15]
| HKT criterion | Weight | Where we show it |
|---|---|---|
| Problem-solution fit | 25 | one decision, one delegator; E1-E5 |
| Technical execution | 25 | pure engine, two local models, harness, verifier |
| UX, Gen Z | 20 | phone-first app, Wally, EN + 繁, QR join |
| Security and trust | 15 | signed credential, Needs your OK, signed receipts, fail closed [F19] |
| Rail feasibility | 15 | Single Use Card semantics [F1]; RailPort table (09) |

## Hard Q&A
| Question | Answer |
|---|---|
| Whose models? | Third-party open source, on this Mac: Laya judges (Convai Innovations [F11c]); Qwen3.5 plans and reads the budget sentence (Alibaba Cloud [F27]). Ours: the questions, fitted thresholds, the code around them. |
| Did AI write your code? | Allowed [F16]; we explain every module. Crib: credential → planner → judge → engine R1-R12, sole producer of decisions → signed log → SIMULATED rail ([02](02-architecture.md)). |
| Judge wrong? | It only tightens (I3). Alone it let 8 of 40 attack items through, 6 of 20 held out [F69]; hard rules and the rail limit use no model; errors escalate. |
| Qwen wrong? | It proposes; code checks item and quantity against the catalogue; judge and rules still decide. Wrong item in 0 of 26 scenarios: author-written, no held-out set, few Cantonese cases [F68]. |
| Cloudflare, Visa, Mastercard, Alipay? | Cloudflare: x402 rail, merchants must support it [F10]. Card pilots run through banks and issuers [F7a, F7b]; Alipay has single-use authorisation [F9]. Not found: seller check at card checkout, a stated loss rule. |
| Real or simulated? | Rail SIMULATED, no issuing API found [F1]; one human-typed decline will calibrate it [F40]. |
| Who pays? | Loss rule v0 ([01](01-product-brief.md)): delegator inside the mandate, operator on a logged breach, merchant on non-delivery; fee HK$150 [F3]. |
| Why not a card limit? | A Single Use Card limit is set by hand [F1] and knows no seller or budget. Ours sizes each card to the cart (I2); the agent cannot mint (I4) or do the arithmetic; R12 voids on drift. |
| No Scameter record? [F6] | R9 denies flagged, escalates unchecked or stale; a fresh no-hit search passes. |
| Offline? Our data? | On-device mode: the real engine, recorded answers, no network. On the booth Mac both models bind 127.0.0.1. Voice may send audio to the browser's speech service. |
| Phones? Family budget? | LAN is plain http with one shared token [F92]: demo plumbing. The verifier checks the child's receipts, not Mum's credential. |

## Honesty slide
| Status | What |
|---|---|
| **Real** | Engine, credential, signed log, offline verifier, and two third-party open-source models on this Mac (Laya, Qwen3.5); public facts read 2026-10-02, still READ-BY-CLAUDE |
| **Simulated** | Rail and merchant lock (Single Use Card semantics [F1]), merchants, flagged seller, amounts [F20-F23], every scenario |
| **Shortcut** | The booth server holds the delegator's demo key and Mum's; on-device mode puts every key in the page |
| **Limits** | Models read no raw pages and do no arithmetic; seller gate inert [F36]; Cantonese rests on the model [F68]; no physical-phone test; stopwatch pending |
| **Assumed** | Judge thresholds [F36], card TTL [F30], escalation window [F31] |

- **Measured**: our harness only, MEASURED(n); vendor figures stay VENDOR-REPORTED [F11c]. **Not affiliated** with HKT, Tap & Go or Mastercard; no logos.
- [ ] Before the pitch: re-capture cited READ-BY-CLAUDE facts; re-run the harness if the judge changed.

