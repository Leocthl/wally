# 09 HKT delegation API ask

**Proposal, not an HKT commitment.**

## Observed gaps
- **Not found in public sources as of 2026-10-02**: an issuing API for delegates (cards are made by hand [F1]); a role for software acting for a holder (T&C: platform-only, no disclosure of security details, no cancel after payment [F2]); a merchant lock or purpose [F1]; a loss rule for delegated purchases (dispute fee HK$150 [F3.dispute_fee]).

## Smallest pilot: today's Single Use Card, no new API
- **Steps**: Wally approves a cart and names the limit; the holder makes the card by hand at that limit [F1], pays and reports the charge; Wally checks it against the approved total and logs it.
- **Card details**: only the holder and the merchant see them; no model, prompt or log does (I8).

## 90-day pilot card (ASSUMED [F97])
| Item | Setting |
|---|---|
| Holders | 50 Pro-account holders, 18 and over [F2.pro], aged 21-30 [F24] |
| Cap, merchants | HK$500 sealed per holder, under the HK$2,000 card ceiling [F1.ceiling]; five allow-listed merchants |
| Targets | no charge above the approved total; at least 90% of honest buys approved [F38]; p95 decision time at most 3,000 ms [F35] |
| Reported | trust score (1 to 5, "I would let Wally shop for me again"); cancel rate |
| Exit | the targets met on the pilot log, which anyone can verify offline |

- **Our results so far**, 150 SIMULATED scenarios [F69]: 0/120 over-limit mints; 61/66 honest buys approved; p95 388.9 ms.

## Proposed API (replaces the hand step)
| Method | Purpose |
|---|---|
| `POST /delegates` | Create delegate; the holder names the software and credential hash |
| `POST /delegates/{id}/cards` | One-off card: `limit`, `ttl`, `merchant_lock`, `purpose`, `preauth_tolerance` (merchants may pre-authorise above the charge [F2.preauth]); `Idempotency-Key`; one use [F1.expiry]; credentials to the executor only |
| `POST /cards/{id}/revoke` | Before first use; none after a processed payment [F2.cancel] |
| Webhook, `GET /delegates/{id}/audit` | Signed card events (`authorised`, `declined`, `voided`, `expired`) and an append-only audit export |

- Names are illustrative. `ttl` 30 min [F30] (ASSUMED). Our merchant lock and purpose are SIMULATED.

## Rails, one sentence each
- **Single Use Card, today**: made by hand, one use [F1]; the pilot runs here.
- **Mastercard Agent Pay**: Hong Kong's first live agentic transaction ran through issuing banks [F7a]; if HKT's issuer joins, the adapter takes an agent token instead of a hand-made card.
- **FPS**: a payer can pre-authorise a named payee with a limit (eDDA); no delegate feature found [F102]; ask HKT.
- **UnionPay**: an agentic payment protocol was published in 2026; no single-use credential found [F102]; ask HKT.
- The engine, credential and log stay the same on any rail; only the `RailPort` adapter changes [F19].

## Phase 2: spend Club Points first
- A points budget makes a wrong buy cost points, not cash; the Club by HKT Innovation Award ties here [F15]. Can a delegate redeem Club Points? Not found; ask HKT.

## Loss allocation: three options for HKT Compliance
- **Operator** = the party running the Wally software: the Wally team in the pilot, the wallet or issuer once it embeds Wally.
- **A, holder bears (our v0, [01](01-product-brief.md))**: the holder loses what the rules approved inside the sealed budget; the Operator bears a breach proven by the log; the merchant bears non-delivery.
- **B, shared**: A, and HKT waives the HK$150 dispute fee [F3] for logged delegated purchases inside the pilot cap.
- **C, reserve**: the Operator funds a loss reserve; the holder bears nothing inside the cap.
- In every option a rail or issuer error is HKT's to place.

## Hong Kong route (not legal advice)
- **Position**: Wally is delegate software inside the licensed wallet and holds no value; HKT Payment Limited is the SVF licensee [F100]. Exposure is capped at the sealed budget (I2).
- **Terms** [F2]: sharing security details is barred and HKT may stop payments on suspected third-party use, so delegated use needs an addendum: a named, revocable delegate role; credentials to the executor only; a written loss rule.
- **Data**: shopper data stays on the device or the booth Mac; PDPO and the PCPD agentic AI guidance apply [F101].
- **Route**: HKT's Sandbox++ pilot covers who the agent is; ours covers what it may spend [F8]. Order: scope and addendum, sandbox slot, 90 days by hand, then the API.

## Our side
- **Rail**: SIMULATED; our software accesses no HKT system. **Sources**: public pages, READ-BY-CLAUDE until captured [F1, F2, F3].
