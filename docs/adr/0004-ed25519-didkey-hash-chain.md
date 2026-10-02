# ADR-0004: Ed25519, did:key and a hash-chained log

- **Status**: Accepted (planning pass). Links: I7, DIR7, T-V1, [02 §11](../02-architecture.md), `schemas/log-entry.schema.json`.
- **Context**: DIR7 asks for a log a third party can verify without trusting the operator. AP2 uses verifiable credentials [F12]; HKT's agent-ID pilot uses DIDs [F8].
- **Decision**: Ed25519 signatures, did:key identifiers, RFC 8785 canonical JSON, SHA-256 hash chain in append-only JSONL, a head checkpoint published outside the log, and an offline verifier page on `@noble/curves` and `@noble/hashes`.
- **Consequences**: A flipped byte, reorder or truncation before the checkpoint fails verification (T-V1). Whoever holds the engine key can still rewrite entries after the last outside checkpoint. D9 can drop did:key and keep plain Ed25519 keys; schemas accept both.
- **Rejected alternative**: Full W3C VCs, or anchoring the head hash on a public chain. Better interoperability and stronger truncation proof, but more libraries and a network dependency than 48 h allows [F13]; a published head hash gives most of the demo value.
