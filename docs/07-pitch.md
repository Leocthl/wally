# 07 Pitch

## Finalist run-of-show: 5 + 2 min [F14, F42, F70]
| Block | Time | Deck | Say |
|---|---|---|---|
| **Hook** | 0:00-0:40 | 1-3 | The pipe is live: Mastercard [F7a], Visa [F7b] and HKT's Single Use Card [F1]. The brake is not: the only control we found is trust. 12,505 scams in 2025 [F4] is why the seller check matters; early 2026 is down 28% [F5b]. One shopper: Gen Z, 21 to 30 [F5a]. Mum is a feature. |
| **Demo** | 0:40-3:00 | Presenter | Seal one sentence [F20]. Wally can only ask: the planner names a title, code prices the cart, the rules decide, the decision is logged first, then a one-off card for the exact total [F21]. Charge more: declined. Three stops. Flip one byte: Proof fails. |
| **Evidence** | 3:00-3:30 | 10-11 | What each layer adds, on our own 150 scenarios [F69]. Zero of 84 means under about 4 in 100 [F96]; 5 of 66 honest buys blocked. Limits: rail simulated, seller data a fixture, consent one tap [F36]. Over 4,000 tests [F91]. |
| **Market, moat** | 3:30-4:15 | 12-13 | A wallet or issuer pays; the shopper pays nothing; fee guess untested [F98]. Anchors, not Hong Kong figures [F94, F95]. Rails will bundle limits and AP2 defines signed budgets; we found no one that also screens listing text, sizes each card to the cart and keeps a decision log anyone can verify offline [F103]. |
| **Path** | 4:15-4:45 | 14-16 | Delegate software inside the licensed wallet, exposure capped at the sealed budget; HKMA sandbox route [F8]. Pilot on today's card, no new API: 90 days, 50 holders [F97]. One ask: a delegation API. Then Club Points. Hallway result ([12](12-hallway-interviews.md)). |
| **Team** | 4:45-5:00 | 17-18 | Four roles, four names. Repo public at submission [F18]. |

## Booth: 3 minutes, unchanged [F45]
| Block | Time | Say |
|---|---|---|
| Hook | 0:00-0:25 | 12,505 online shopping scams in Hong Kong in 2025 [F4]; six in ten victims were 11 to 30 [F5c]. Now give them an AI agent with a wallet. Meet Wally: a signed budget it cannot overspend, and it checks the shop before it pays. |
| Seal + one-off card | 0:25-1:05 | One sentence, "HK$800, clothes, verified sellers" [F20]; Wally turns it into rules you check and sign. It can only ask. Two models run on this laptop: Qwen picks the item, Laya judges the listing. An approved cart gets a one-off card for the exact total, shipping included [F1]. Charge more: declined. Use it twice: declined. |
| Three stops | 1:05-2:10 | Seller flagged: no card exists. Over budget by HK$9 once shipping lands [F22]: stopped before paying. Orders hidden in the listing: Laya scores them, the rules stop them. Unsure: Needs your OK, and a yes never overrides a fixed rule. Try to trick it yourself. |
| Proof | 2:10-2:40 | Every decision is a signed receipt; flip one byte and Proof fails. On 150 replayed scenarios AI alone overspent in 6.0 percent and let 43 of 84 traps through; rules alone let 28; rules plus judge, none [F69]. |
| Limits + ask | 2:40-3:00 | The rail is simulated. Both models are third-party open source on this Mac. Every number is from our harness. HKT has the wallet, the card and an agent-ID pilot [F1, F2, F8]; we found no delegation API [F1]. |

- **What each layer adds** [F69]: AI alone = our B0 (Laya trusted, no arithmetic, no card limit), a baseline we built, no claim about shopping agents. Rules only = B1. Rules plus judge = B2.
- **Deck**: slides 4-9 are stills if the app fails; 19-22 are hidden. **Then**: Q&A or hands-on [F45]; see [06](06-demo-script.md).

## Scoring map [F15]
- **HKT weights**: fit 25, slides 2-3 · execution 25, engine, two local models, harness, verifier · UX 20, phone-first app, EN + 繁 · trust 15, credential, fail closed, consent design [F19] · rail 15, slides 14-16 and [09](09-hkt-delegation-api-ask.md). **Stage**: framing 2-3, market 12-13, vision 14-16.

## Hard Q&A
| Question | Answer |
|---|---|
| Whose models? Did AI write the code? | Third-party open source, on this Mac: Laya judges [F11c]; Qwen3.5 plans [F27]. Ours: the questions, thresholds, the code around them. AI assistants are allowed; we explain every module [F16] ([11](11-explain-the-code.md)). |
| Judge or Qwen wrong? | The judge only tightens (I3); alone it let 8 of 40 attack items through, 6 of 20 held out [F69]. Qwen proposes and code checks it against the catalogue: wrong item in 0 of 26 author-written scenarios, no held-out set [F68]. Hard rules and the rail limit use no model. |
| Who pays, how big? | A wallet or issuer; the shopper pays nothing. Fee guess ASSUMED [F98]. Anchors are not Hong Kong figures [F94, F95]; demand data starts with the pilot. |
| Why will Visa, Mastercard, Cloudflare or Alipay not ship this? | They may bundle limits for their own rail. AP2 defines signed budgets and ships no enforcer. We found no one that also screens listing text, sizes cards to the cart and keeps a decision log anyone can verify offline [F103]. Wrong if one ships all of it, or none adopts our budget. |
| 0 of 84 against what? | Our own SIMULATED scenarios [F69]. Zero in 84 means under about 4 in 100 [F96], not never. Rules alone stop overspend; the judge adds trick-listing cover; 5 of 66 honest buys blocked. |
| Allowed under HKT's terms and HKMA rules? Who is liable? | Not covered today [F2]; the ask adds an addendum. Our position, not legal advice: delegate software inside the licensed wallet, no value held, exposure capped at the sealed budget (I2); HKMA sandbox route [F8]. Three loss options for HKT Compliance ([09](09-hkt-delegation-api-ask.md)). |
| Why you: company or feature? | Either. A wallet could build it; we are the neutral budget-and-proof layer across rails. Wrong if a rail bundles both, or none adopts ours. The licence is still a team decision. |
| Walk me from "buy a tee" to the card | Planner names the title; code prices the cart; the pure engine decides; the DECISION is logged first; mint for the exact total, void if the append fails; the executor charges once ([11](11-explain-the-code.md)). |
| Who holds the delegator key? What stops a forged log? | Demo: the booth server. The verifier proves consistency against the keys you give it: pin them, keep the head checkpoint outside the log. Production design: key on the phone, biometric step-up. |
| Mint a real card tomorrow? Who touches the PAN? | No issuing API found [F1]. The holder makes the card by hand at Wally's limit; Wally checks the charge and logs it. Card details reach only the executor (I8). |
| Why not a card limit? | A Single Use Card limit is set by hand [F1] and knows no seller or budget. Ours sizes each card to the cart (I2). |
| No Scameter record? [F6] | R9 escalates unchecked or stale; a fresh no-hit search passes. Seller data is a fixture; the seller gate is inert [F36]. |

## Honesty slide
| Status | What |
|---|---|
| **Real** | Engine, credential, signed log, offline verifier, two third-party models; public facts READ-BY-CLAUDE |
| **Simulated** | Rail, merchant lock [F1], merchants, flagged seller, amounts [F20-F23], every scenario |
| **Shortcut** | Server-held demo keys; design: key on the phone, biometric step-up |
| **Limits** | Models read no raw pages, do no sums; seller gate inert [F36]; Cantonese rests on the model [F68] |
| **Assumed** | Judge thresholds [F36], card TTL [F30], fee [F98], pilot [F97] |

- **Measured**: our harness only; vendor figures stay VENDOR-REPORTED [F94]. **Not affiliated** with HKT, Tap & Go or Mastercard.
- [ ] Before the pitch: re-capture READ-BY-CLAUDE facts; add the hallway tally.
