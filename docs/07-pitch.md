# 07 Pitch

## Finalist run-of-show: 5 + 2 min [F14, F42, F70]
| Block | Time | Deck | Say |
|---|---|---|---|
| **Hook** | 0:00-0:40 | 1-3 | The pipe is live: Mastercard [F7a], Visa [F7b] and HKT's Single Use Card [F1]. The brake is not: each card has a limit its holder sets; no shared budget, seller check or offline proof found. 12,505 scams in 2025 [F4]; early 2026 is down 28% [F5b]. One shopper: Mei, 23, Gen Z [F24]. |
| **Demo** | 0:40-3:00 | Presenter, stills 4-8 | Seal one sentence [F20]. Wally can only ask: the planner names a title, code prices the cart, the rules decide, the decision is logged first, then a one-off card for the exact total [F21]. Charge more: declined. Three stops. Flip one byte: Proof fails. |
| **Evidence** | 3:00-3:30 | 9 | What each layer adds, on our own 150 scenarios [F69]. Zero of 84 allows up to about 4 in 100 [F96]; 5 of 66 honest buys blocked. Limits: rail simulated, seller data a fixture, consent one tap [F36]. |
| **Market, moat** | 3:30-4:15 | 10 | A wallet or issuer pays; the shopper pays nothing; price not set [F98]. Anchors, not Hong Kong figures [F94, F95]. Rails will bundle limits and AP2 defines signed budgets; we found no one that also screens listing text, sizes each card to the cart and keeps a log a third party can check offline [F103]. Agent-card startups [F114] are rails. |
| **Path** | 4:15-4:45 | 11 | Delegate software inside the licensed wallet, exposure capped at the sealed budget; HKMA sandbox route [F8]. Pilot on today's card, no new API: 90 days, 50 holders [F97]. One ask: a delegation API. Then Club Points. Hallway result ([12](12-hallway-interviews.md)). |
| **Team** | 4:45-5:00 | 12 | Four roles, four names. Repo public at submission [F18]. |

## Booth: 3 minutes, same beats [F45]
| Block | Time | Say |
|---|---|---|
| Hook | 0:00-0:25 | 12,505 online shopping scams in Hong Kong in 2025 [F4]. Now give shoppers an AI agent with a wallet. Meet Wally: a signed budget it cannot overspend, and it checks the shop before it pays. |
| Seal + one-off card | 0:25-1:05 | One sentence, "HK$800, clothes, checked sellers" [F20]; Wally turns it into rules you check and sign. It can only ask. Two models run on this laptop: Qwen picks the item, Laya judges the listing. An approved cart gets a one-off card for the exact total, shipping included [F1]. Charge more: declined. Use it twice: declined. |
| Three stops | 1:05-2:10 | Seller flagged: no card exists. Over budget by HK$9 once shipping lands [F22]: stopped before paying. Orders hidden in the listing: Laya scores them, the rules stop them. Unsure: Needs your OK; a yes never overrides a hard rule. Try to trick it. |
| Proof | 2:10-2:40 | Every decision is a signed receipt; flip one byte and Proof fails. On 150 replayed scenarios rules alone (no seller check, no judge) let 28 of 84 traps through; all rules plus the judge, none; our weak bare-judge baseline, 43 [F69]. |
| Limits + ask | 2:40-3:00 | The rail is simulated. Both models are third-party open source on this Mac. Every number is from our harness. HKT has the wallet, the card and an agent-ID pilot [F1, F2, F8]; we found no delegation API [F1]. |

- **What each layer adds** [F69]: rules only = B1 (R1 to R8, R12, card limit; no seller check, no judge); Wally = B2 (all of R1 to R12); bare AI judge = our weak B0 (Laya trusted, no card limit), shown last.
- **Deck**: 12 slides; 4, 5, 8 are stills if the app fails; 13-34 are hidden backups. **Then**: Q&A or hands-on [F45]; [06](06-demo-script.md).

## Scoring map [F15]
- **HKT weights**: fit 25, slides 2-6 · execution 25, engine, models, harness · UX 20, phone-first app · trust 15, credential, consent design [F19] · rail 15, slide 11, backups 26-29, [09](09-hkt-delegation-api-ask.md). **Stage**: framing 2-3, market 10, vision 11.

## Hard Q&A
| Question | Answer |
|---|---|
| Whose models? Did AI write the code? | Third-party open source: Laya judges [F11c]; Qwen3.5 plans [F27]. Ours: the questions, thresholds and code around them. AI assistants are allowed; we explain every module [F16] ([11](11-explain-the-code.md)). |
| Judge or Qwen wrong? | The judge only tightens (I3); alone it let 8 of 40 attack items through, 6 of 20 held out [F69]. Qwen proposes and code checks it against the catalogue: wrong item in 0 of 26 author-written scenarios (9B), no held-out set [F68]. Hard rules and the rail limit use no model. |
| Who pays, how big? | A wallet or issuer; the shopper pays nothing. Price not set [F98]. Anchors are not Hong Kong figures [F94, F95]; demand data starts with the hallway tally and the pilot. |
| Why will Visa, Mastercard, Cloudflare or Alipay not ship this? | They may bundle limits for their own rail. We found no one that also screens listing text, sizes cards to the cart and keeps a log a third party can check offline [F103]. Wrong if one ships all of it or none adopts ours. |
| 0 of 84 against what? | Our own SIMULATED scenarios [F69]. Zero in 84 allows up to about 4 in 100 [F96], not never. Rules alone stop overspend; the judge adds trick-listing cover; 5 of 66 honest buys blocked. |
| Allowed under HKT's terms and HKMA rules? Who is liable? | Not covered today [F2]; the ask adds an addendum. Our position, not legal advice: delegate software inside the licensed wallet, no value held, exposure capped at the sealed budget (I2); HKMA sandbox route [F8]. Three loss options for HKT Compliance ([09](09-hkt-delegation-api-ask.md)). |
| Why you: company or feature? | Either. A wallet could build it; we are the neutral budget-and-proof layer across rails. Wrong if a rail bundles both. The code is Apache-2.0. |
| Walk me from "buy a tee" to the card | Planner names the title; code prices the cart; the pure engine decides; the DECISION is logged first; mint for the exact total, void if the append fails; the executor charges once ([11](11-explain-the-code.md)). |
| Who holds the delegator key? What stops a forged log? | Demo: the booth server. The verifier checks consistency against keys you pin; keep the head checkpoint outside the log. Production design: key on the phone, biometric step-up. |
| Mint a real card tomorrow? Who touches the PAN? | No issuing API found [F1]. The holder makes the card in the app at Wally's limit; Wally checks the charge and logs it. Only the executor sees card details (I8). |
| Why not a card limit? | A Single Use Card limit is set by its holder [F1]; no shared budget or seller check found. Ours sizes each card to the cart (I2). |
| No Scameter record? [F6] | R9 escalates unchecked or stale; a fresh no-hit search passes. Seller data is a fixture; the seller gate is inert [F36]. |

## Honesty slide (deck backup 23)
| Status | What |
|---|---|
| **Real** | Engine, credential, signed log, offline verifier, two third-party models; public facts READ-BY-CLAUDE |
| **Simulated** | Rail, merchant lock [F1], merchants, flagged seller, amounts [F20-F23], every scenario |
| **Shortcut** | Server-held demo keys; design: key on the phone, biometric step-up |
| **Limits** | Models read no raw pages, do no sums; judge thresholds fitted on simulated cases, seller gate inert [F36]; Cantonese rests on the model [F68]; the photo reader names the kind of garment, nothing more [F68a] |
| **Assumed** | Card TTL [F30], fee [F98], pilot [F97] |

- **Measured**: our own runs only; vendor figures stay VENDOR-REPORTED [F94].
- [ ] Before the pitch: re-capture READ-BY-CLAUDE facts; add the hallway tally.
