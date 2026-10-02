# ADR-0005: Gen Z adult as the default delegator

- **Status**: Accepted (planning pass). Links: D2, D9, [01](../01-product-brief.md).
- **Context**: Victims of online shopping scams: 44% aged 21-30, 16% aged 11-20 [F5a]. Tap & Go Pro is 18+, Plus(ii) is 11-17 [F2]. Minors as the headline raise consent and optics questions.
- **Decision**: The default delegator is an HK Gen Z adult aged 21-30 [F24] sealing a monthly clothing packet [F20]. The chain (parent → child → agent, caps compose) is an extension (D9).
- **Consequences**: The demo needs one account holder and no parent. `Mandate.parent` is optional, so the chain can land later without a schema break. The pitch can still cite the 11-30 band [F5c].
- **Rejected alternative**: Teen first, with a parent-sealed packet. It shows the strongest HKT edge (prepaid from age 11 [F2]), but needs a two-party demo and puts minors in the headline.
- **Update 2026-10-03**: the chain shipped as the optional family budget (D17). `Mandate.parent` links a child budget to Mum's credential; a wider child is refused `EXCEEDS_PARENT`. The offline verifier cannot check the parent link, and Mum's key is a demo shortcut. Minors are still not the headline.
