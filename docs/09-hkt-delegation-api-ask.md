# 09 HKT delegation API ask

**Proposal, not an HKT commitment. Not affiliated with HKT.**

## Observed gaps
- **Issuance**: an issuing API for delegates: not found in public sources as of 2026-10-02. Cards are made by hand in the app; up to HK$2,000 each, 2 active, valid up to 2 months [F1].
- **Delegate role**: a role for software acting for a holder: not found in public sources as of 2026-10-02. The T&C: platform-only role, no disclosure of security details including the CVV, no cancelling a processed payment [F2].
- **Card terms and fee**: the separate Single Use Card terms and any card fee: not located in public sources as of 2026-10-02 [F1, F3].
- **Loss rule**: who bears a delegated purchase the holder did not intend: not found in public sources as of 2026-10-02. Dispute fee: HK$150 per transaction [F3.dispute_fee].

## Proposed API
| Method | Purpose | Notes |
|---|---|---|
| `POST /delegates` | Create delegate | Holder names the software and mandate hash; can list and remove delegates |
| `POST /delegates/{id}/cards` | Mint card | `limit`, `ttl`, optional `merchant_lock` and `preauth_tolerance` (merchants may pre-authorise above the final charge [F2.preauth]); one-use as today [F1.expiry]; credentials go to the executor service only, the planner sees a handle |
| `POST /cards/{id}/revoke` | Revoke | Before first use; no effect after a processed payment [F2.cancel] |
| Webhook | Card events | `authorised`, `declined`, `voided`, `expired`; signed |
| `GET /delegates/{id}/audit` | Audit export | Append-only, signed; a third party can check it without trusting the delegate |

- Names are illustrative. `limit` within the HK$2,000 ceiling [F1.ceiling]; `ttl` 30 min [F30] (ASSUMED).

## T&C addendum: delegated use
- **Delegate role**: named, revocable, acts only inside the holder's mandate.
- **Credentials**: held only by executor software, never by a language model, prompt or log.
- **Secrecy carve-out**: the clause on security details [F2.secrecy] permits executor software to hold PAN and CVV, provided it never shows them to an LLM.
- **Loss allocation**: a written rule for purchases the mandate allowed and did not allow, including who pays the dispute fee [F3.dispute_fee]. Our v0: [01](01-product-brief.md).

## Pilot scope
- **Prepaid** first: Pro holders (18+ [F2.pro]) aged 21-30 [F24]; teens 11-17 on Plus(ii) [F2.plus2] later, with parent consent.
- **Phases**: sandbox, no live money; small adult group; teens last.

## Success metrics
- **Targets (ASSUMED)**: 0 over-limit mints in deterministic scenarios and at least 90% of legitimate scenarios approved [F38]; p95 decision latency at or under 3,000 ms [F35]. Our MEASURED value goes beside each.
- **Our results**: overspend, prompt-only limit [X] against full pipeline [Y], MEASURED(n) with seed and commit. TODO(D-11): fill after M3.
- **Pilot adds**: disputes per delegated purchase; cards used before expiry. No target set.

## Fit with the agent-ID pilot
- HKT Payment and Red Date announced an Agentic ID pilot on 2026-08-27 (DIDs and verifiable credentials for payment flows) [F8]. A delegate record could carry such an ID; our mandate is AP2-shaped [F12], so a credential can wrap it later. No claim about the pilot's results.

## Our side
- **Rail**: SIMULATED, mirrors [F1]; our software accesses no HKT system. TODO(D-03): add the real-card decline result and date.
- **Sources**: public pages, READ-BY-CLAUDE until a teammate captures them [F1, F2, F3]; send only after OBSERVED. Corrections welcome.
