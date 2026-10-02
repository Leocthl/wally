# ADR-0006: TypeScript pnpm monorepo

- **Status**: Accepted (planning pass). Links: 00-context lanes A-D, [02 §13](../02-architecture.md).
- **Context**: A 3-4 person team in 48 h [F13] runs lanes in parallel. Engine, UI and the offline verifier share types and crypto.
- **Decision**: One TypeScript pnpm monorepo: `apps/web`, `apps/verifier`, `packages/core`, `packages/rail-sim`, `packages/agent`, `packages/harness`. JSON Schema is the source of truth, with generated types and ajv at boundaries. Append-only JSONL, no database.
- **Consequences**: One language and one test runner; the verifier reuses core crypto; ports in `core` keep lanes independent. Jev ships an npm SDK, `@typesafe-ai/sdk` [F11b]; its HTTP API is the fallback.
- **Rejected alternative**: Python (FastAPI) backend with a React frontend. Better data tooling for the harness, but two type systems and a second crypto implementation for the browser verifier.
