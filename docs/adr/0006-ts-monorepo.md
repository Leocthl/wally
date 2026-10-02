# ADR-0006: TypeScript pnpm monorepo, Laya as a local service

- **Status**: Accepted (revised 2026-10-02, contract V2). Links: 00-context lanes A-D, [02 §13](../02-architecture.md), ADR-0008.
- **Context**: A 3-4 person team in 48 h [F13] runs lanes in parallel. Engine, UI and the offline verifier share types and crypto. The judge model ships as a Python package with an HTTP server [F11c].
- **Decision**: One TypeScript pnpm monorepo: `apps/web`, `apps/verifier`, `packages/core`, `packages/rail-sim`, `packages/agent`, `packages/harness`. JSON Schema is the source of truth, with generated types and ajv at boundaries. Append-only JSONL, no database. Laya runs as a pinned local Python service in `services/laya/` (setup, serve, stop, smoke), reached over HTTP on 127.0.0.1 only.
- **Consequences**: One language for our code and one test runner; the verifier reuses core crypto; ports in `core` keep lanes independent. The Python service stays outside the packages, pinned by version, checkpoint commit and weights hash; CI mocks it.
- **Rejected alternative**: Python (FastAPI) backend with a React frontend. Better data tooling for the harness, but two type systems and a second crypto implementation for the browser verifier.
