# 11 Explain the code

- **Rule**: before judging, every teammate tells the six steps without notes and runs `pnpm invariants` live [F16].

## The mint path in six steps
| # | Step | Where (`packages/core/src` unless noted) |
|---|---|---|
| 1 | **Planner proposes titles.** `propose_cart` is its only tool; the schema refuses money fields (I4) | `agent/src/planner`, `cart/proposal.ts` |
| 2 | **Code builds the cart.** Items are priced by exact title from the stored listing record; the total is an integer sum | `cart/build.ts`, `cart/listing.ts` |
| 3 | **Engine decides.** Pure `decide`, rules R1 to R12; any DENY wins, then any ESCALATE, else APPROVE; the judge enters only through R10 | `engine/decide.ts`, `engine/assemble.ts` |
| 4 | **DECISION is logged and signed first.** `decideAndRecord` folds the log, decides, appends, then acts (I7) | `orchestrator/record.ts`, `log/append.ts` |
| 5 | **Re-fold, then mint.** `mintFor` re-reads the log, refuses a revoked, ended or already minted approval, then asks the rail for a card limited to the approved total (I2). A failed card append voids it | `orchestrator/record.ts` |
| 6 | **Executor charges the exact total.** It re-quotes (R12 voids on drift) and retries with one idempotency key; the rail declines anything above the limit or a second use | `executor/checkout.ts` |

## The eight invariants (`pnpm invariants`: half a minute, one line each)
- **I1** no mint without an APPROVE for that cart · **I2** limit equals the approved total · **I3** the judge can only tighten · **I4** the planner holds no keys and no payment tool
- **I5** any error, timeout or unknown stops the buy · **I6** no card after the budget is cancelled or ended · **I7** one signed log entry per decision, the chain verifies · **I8** no card number or CVV in logs, fixtures or prompts

## Where each model sits
| Model | Does | Cannot |
|---|---|---|
| **Laya**, judge (`agent/src/judge`) | Scores listing text as data; the engine reads the scores through R10 [F36] | Write text, do sums, loosen a decision (I3), see card data. An error escalates (I5) |
| **Qwen3.5**, planner and sentence reader (`planner/local`, `compiler`) | Picks an item; suggests rule chips the shopper confirms [F27] | Gate a decision, hold a key (I4), set a price. Code checks every answer against the catalogue |

## The five questions a technical judge asked
| Question | Strong answer |
|---|---|
| "Buy a tee" to the card? What if the log write fails after APPROVE? | The six steps. The DECISION is already logged; a failed card append voids the card; a crash leaves a hold until revoke or expiry ([08](08-risk-register.md)) |
| The judge leaked 6 of 20 held out. Why say none? | Rules alone overspend 0 of 150 and read no text [F69]. The judge adds trick-listing cover: 0 of 13 judge-only cases passed, bound about 23 in 100 [F96]. The claim is bounded loss, not zero |
| Who holds the delegator key? What stops a forged log with fresh keys? | Demo: the server holds it. The verifier trusts only the public keys you give it plus a head checkpoint kept outside the log; without one a truncated log passes. Design: `apps/web/src/api/local/KEYS.md` |
| Mint a real card tomorrow? Who touches the PAN? | No issuing API found [F1]. The holder makes the card by hand at Wally's limit; Wally checks the charge and logs it. Only the executor would hold card details (I8) |
| A hostile title, seller name or category label? | Titles must match the listing exactly. Category is merchant-declared and R6 trusts it; no title-fuzzing test yet |

## Real or simulated
| Part | Status |
|---|---|
| Engine, credential, signed log, offline verifier; over 6,000 automated tests [F91] | Real code |
| Laya and Qwen3.5 on this Mac | Real, third-party, Apache-2.0 [F11c, F27] |
| Card rail, merchants, flagged seller, amounts, every scenario | **SIMULATED** [F20-F23] |
| Seller data; delegator key | Fixture, gate inert [F36]; server-held demo key |
| Real-card decline, shop probe | Not done [F39, F40] |
