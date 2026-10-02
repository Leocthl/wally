# ADR-0003: Simulated rail, one real test

- **Status**: Accepted (planning pass). Links: D6 U4, D7, D10, I8, T-R1, [02 §10](../02-architecture.md).
- **Context**: No public API for issuing Single Use Cards found; issuance is by hand in the app [F1]. A processed payment cannot be cancelled, and card security details must not be disclosed [F2].
- **Decision**: Build `rail-sim` mirroring F1 (ceiling, validity, one use, max active) and label it SIMULATED everywhere. Calibrate `OVER_LIMIT` against one real decline that a human types in [F40]. Add a read-only shop-readiness probe [F39].
- **Consequences**: No real money moves; the honesty slide says so. Revocation is shown before mint or first use (S4). Software never handles PAN or CVV (I8). If an HKT mentor confirms a delegate API is planned [F17], retarget the ask (D10).
- **Rejected alternative**: Drive the real app with UI automation to mint real cards. More realistic, but it would mean software handling card details against the T&C [F2], it is fragile on stage, and judges cannot check it.
