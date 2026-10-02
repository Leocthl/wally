# Capture sheet

Protocol: [docs/05-evidence-plan.md](../docs/05-evidence-plan.md#capture-protocol). Raw files go in `data/raw/` (gitignored, never committed). Commit only the redacted copy in `data/captures/`.

| id | register row | claim | value seen | URL | captured at (UTC+8) | captured by | raw file (gitignored) | redacted file | status |
|---|---|---|---|---|---|---|---|---|---|
| C00 | F__ | EXAMPLE, delete | value as shown on the page | https://... | YYYY-MM-DD HH:MM | initials | data/raw/C00.png | data/captures/C00.png | PENDING |

- **status**: `PENDING` (captured, register row not yet promoted); `OBSERVED(date)` (row promoted in one commit); `MISMATCH` (differs from the register: the observed value wins, update the row and tell the lead).
- **Never capture**: PAN, CVV, expiry, personal data, or a real seller's phone, FPS ID or page name.

## Capture queue
- [ ] **F1** Single Use Card values (tapngo.com.hk, pccw.com); needs a Plus(ii) or Pro holder (Lane D)
- [ ] **F2** T&C clauses: cancel, refund, role, secrecy, preauth
- [ ] **F3** charges: dispute fee, FX fees
- [ ] **F6** Scameter Important Notice and privacy pages; one manual lookup per listing, no Bulk Search
- [ ] **F11b** Jev model string and limits as shown in the Typesafe console once the key arrives (Lane B)
- [ ] **F16** HacKU rule on pre-existing code (organisers, in writing)
- [ ] **F40** five real listings (apparel, public shop pages; redact any seller identity)
- [ ] **F4** pitch statistic from the police page; **F5a, F5b** confirm figures and dates in a browser (snippet only)
- [ ] **F7a, F7b** confirm announcement dates (sources conflict); **F8, F9** confirm in a browser
