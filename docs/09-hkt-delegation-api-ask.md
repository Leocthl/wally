# 09 HKT delegation API ask

**Proposal, not an HKT commitment. Not affiliated with HKT.**

## Observed gaps
- **Not found in public sources as of 2026-10-02**: an issuing API for delegates (cards made by hand, limits as [F1]); a role for software acting for a holder (T&C: platform-only role, no disclosure of security details, no cancel after payment [F2]); Single Use Card terms or fee [F1, F3]; a merchant lock or purpose [F1]; a loss rule for unintended delegated purchases (dispute fee HK$150 [F3.dispute_fee]).

## Proposed API
| Method | Purpose | Notes |
|---|---|---|
| `POST /delegates` | Create delegate | Holder names the software and credential hash |
| `POST /delegates/{id}/cards` | Mint token | `limit`, `ttl`, `merchant_lock`, `purpose`, `preauth_tolerance` (merchants may pre-authorise above the charge [F2.preauth]); `Idempotency-Key`; one use as today [F1.expiry]; credentials to the executor only |
| `POST /cards/{id}/revoke` | Revoke | Before first use; no effect after a processed payment [F2.cancel] |
| Webhook | Card events | `authorised`, `declined` (incl. merchant mismatch, replay), `voided`, `expired`; signed |
| `GET /delegates/{id}/audit` | Audit export | Append-only, signed; checkable without trusting the delegate |

- Names are illustrative. `limit` within the HK$2,000 ceiling [F1.ceiling]; `ttl` 30 min [F30] (ASSUMED). Our merchant lock and purpose are SIMULATED today.

## Rail portability
| `RailPort` contract | Mastercard SUC today [F1] | FPS | UnionPay |
|---|---|---|---|
| `mint` with limit, expiry | by hand; ceiling and validity as [F1]; no API found | ask HKT | ask HKT |
| One use, replay declined | credentials end after one payment [F1] | ask HKT | ask HKT |
| `merchant_lock`, `purpose` | not found [F1]; asked above | ask HKT | ask HKT |
| Idempotent `authorise` | not found | ask HKT | ask HKT |
| `void` before use, events | not found; no cancel after payment [F2] | ask HKT | ask HKT |

- The engine, credential and log stay the same on any rail; only the `RailPort` adapter changes. HKT's workshop names all three rails [F19].

## T&C addendum: delegated use
- **Delegate role**: named, revocable, acts only inside the holder's credential.
- **Credentials**: executor software only, never a model, prompt or log; a carve-out in the secrecy clause [F2.secrecy].
- **Loss allocation**: a written rule, including who pays the dispute fee [F3.dispute_fee]; our v0 in [01](01-product-brief.md).

## Pilot scope
- **Prepaid** first: Pro holders (18+ [F2.pro]) aged 21-30 [F24]; teens on Plus(ii) [F2.plus2] last, through a parent's budget (the family budget, 01); sandbox first.

## Success metrics
- **Targets (ASSUMED)**: 0 over-limit mints in deterministic scenarios, at least 90% of legitimate scenarios approved [F38]; p95 decision latency at or under 3,000 ms [F35].
- **Our results**, 150 SIMULATED scenarios, seed 7, commit da2c814 [F69]: 0/120 over-limit mints; 61/66 legitimate approved (92.4%); p95 388.9 ms. A model-only gate overspent 9/150 (6.0%) and let 43/84 stop cases through; the full pipeline 0/150 and 0/84. The sandbox would repeat this on real rails.

## Fit with the agent-ID pilot
- The Agentic ID pilot (HKT Payment and Red Date, 2026-08-27) uses DIDs and verifiable credentials [F8]. Our mandate is already a VC 2.0 AgentDelegationCredential with did:key identities [F19]; a delegate record could carry such an ID. No claim about the pilot's results.

## Our side
- **Rail**: SIMULATED, mirrors [F1]; our software accesses no HKT system. Real-card decline result and date: added after D-03.
- **Sources**: public pages, READ-BY-CLAUDE until a teammate captures them [F1, F2, F3]; send only after OBSERVED. Corrections welcome.
