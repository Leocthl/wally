# ADR-0004: Ed25519, did:key and a hash-chained log

- **Status**: Accepted (revised 2026-10-02, contract V2). Links: D9, D11, I7, DIR7, T-V1, [02 §11](../02-architecture.md), `schemas/log-entry.schema.json`, ADR-0007.
- **Context**: DIR7 asks for a log a third party can verify without trusting the operator. HKT's workshop centres on DIDs and W3C VC 2.0 [F19]; AP2 uses verifiable credentials [F12].
- **Decision**: Ed25519 (`@noble/curves`), did:key identifiers (kept: no longer on the D9 cut list), RFC 8785 JCS, a SHA-256 hash chain in append-only JSONL, a head checkpoint published outside the log, and an offline verifier. The mandate is a VC 2.0 credential with a Data Integrity proof, cryptosuite `eddsa-jcs-2022` (ADR-0007); log entries, revocations and answers keep domain-separated Ed25519 signatures.
- **Consequences**: A flipped byte, reorder or truncation before the checkpoint fails verification (T-V1); the verifier also checks the credential proof. Whoever holds the engine key can still rewrite entries after the last outside checkpoint.
- **Rejected alternative**: Anchoring the head hash on a public chain. Stronger truncation proof, but a network dependency the booth cannot rely on; a published head checkpoint gives most of the demo value.
