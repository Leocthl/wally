# ADR-0001: Jev is a gate, not the agent

- **Status**: Accepted (planning pass). Links: D5, I3, R10, [02 §9](../02-architecture.md).
- **Context**: Jev returns typed probabilities, generates no text and cannot browse or plan [F11]. Schema-valid output is not correct output. The scoring sheet rewards a visible stop and a stated rule (E2, E4).
- **Decision**: Claude plans; Jev answers `scope_fit`, `injection_risk`, `seller_risk`, `escalate_or_proceed`. Its output reaches the engine only through R10 and can only move APPROVE to DENY or ESCALATE (I3). Thresholds in config [F36, F50]. Fallback: llm with the same schema and stricter thresholds [F51]. Shadow mode first.
- **Consequences**: A Jev outage or false allow cannot overspend; hard rules still hold. Every Decision records provider, model, version and MEASURED latency. Vendor latency and price stay VENDOR-REPORTED [F11].
- **Rejected alternative**: Jev as the main agent ("overnight desk", Track 4). Closer to Jev's own pitch, but it cannot write a cart or explain a stop, and access is waitlisted [F11b]. Kept as the D8 contingency.
