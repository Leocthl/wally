# ADR-0003: Simulated rail, one real test

- **Status**: Accepted (revised 2026-10-02, contract V2). Links: D6 U4, D7, D10, D13, I8, T-R1, [02 §10](../02-architecture.md).
- **Context**: No public API for issuing Single Use Cards found; issuance is by hand in the app [F1]. A processed payment cannot be cancelled, and card security details must not be disclosed [F2]. HKT's workshop asks for a single-use scoped token with a blocked replay and no duplicate payment [F19].
- **Decision**: Build `rail-sim` mirroring F1 (ceiling, validity, one use, max active) and label it SIMULATED everywhere. DM2 shows overshoot declined, exact charge authorised, replay declined `CARD_USED`. Merchant lock and purpose are SIMULATED (not found on the real card [F1]) and asked of HKT in 09. Mint and authorise are idempotent. Calibrate `OVER_LIMIT` against one real decline that a human types in [F40]; add a read-only shop probe [F39].
- **Consequences**: No real money moves; the honesty slide (deck backup 23) says so. Revocation is shown before mint or first use (S4). Software never handles PAN or CVV (I8). If an HKT mentor confirms a delegate API is planned [F17], retarget the ask (D10).
- **Rejected alternative**: Drive the real app with UI automation to mint real cards. More realistic, but software would handle card details against the T&C [F2], it is fragile on stage, and judges cannot check it.
