# ADR-0002: Deterministic enforcement

- **Status**: Accepted (planning pass). Links: D3, D4, I1-I3, R1-R12, [02 §7](../02-architecture.md).
- **Context**: The median competitor keeps the limit in the prompt, and a prompt can be talked out of a limit. The statement wants the rule stated and the stop shown (E2, E4, DIR8).
- **Decision**: The policy engine (pure TypeScript, R1-R12) is the only producer of a Decision. LLMs only propose (planner) or veto (judge). Explanations render from templates and recorded inputs. The rail enforces the limit a second time: each card's limit equals the approved total (I2).
- **Consequences**: Rules are property-tested (T-I*); the harness compares B0 prompt-only with B2 [F37]; "why" replays from the log. Cost: a plain-language mandate compiles into a fixed rule set, not arbitrary policy.
- **Rejected alternative**: LLM as policy, returning a schema-validated verdict. Quicker to build and handles any wording, but not reproducible across runs and not checkable offline.
