# apps/web

- **What**: the booth UI (Vite + React 19), mobile first, EN with a zh-HK second line. The rail is SIMULATED on every screen.
- **Two clients, one interface** (`ApiClient`, `src/api/types.ts`): `HttpApiClient` (`src/api/http/`) when the booth server answers `/api/info`, else `MockApiClient` (offline, SIMULATED, mock-mode notes on screen). `?api=mock` or `VITE_API=mock` forces the mock. Both pass `test/apiClientContract.ts`.
- **Booth server** (`server/`, Hono, 127.0.0.1 only): `pnpm demo` from the repo root (preflight, build if needed, start), then open the printed URL. `pnpm demo:reset` resets keys, logs and the packet.
- **Stop texts**: `src/explain/renderStop.ts` wraps a stub; lane A's `render` replaces it in one line.

## Run
| Command | Does |
|---|---|
| `pnpm --filter @laisee/web dev` | Vite dev server on 127.0.0.1 |
| `pnpm --filter @laisee/web build` | typecheck and production build |
| `pnpm --filter @laisee/web test` | Vitest: components, mock, reducer, tokens |
| `pnpm --filter @laisee/web e2e` | Playwright smoke test on phone and desktop (builds, serves on 127.0.0.1:4517, uses the cached Chromium) |

## Screens (hash routes)
| Route | Screen |
|---|---|
| `#/booth` | preset M0 sealed on load, scenario buttons, free-text box, Verify and Tamper |
| `#/seal` | sentence beside editable rule chips, Seal |
| `#/run`, `#/console`, `#/log` | one panel each |
| `#/presenter` | big screen, PresenterBar steps DM1 to DM9 |

## Booth server
| Route | Does |
|---|---|
| `GET /api/info`, `/api/snapshot`, `/api/log`, `/api/export`, `/api/health` | state; export = JSONL log, public keys in use, checkpoint for the verifier page |
| `POST /api/seal`, `/api/scenario/:id`, `/api/propose`, `/api/revoke`, `/api/escalation/answer` | pipeline runs (`data/scenarios/booth.json`) |
| `POST /api/verify`, `/api/tamper`, `/api/restore`, `/api/reset` | log demo and reset |
| `GET /api/events` | SSE trace; ready comment, ids, keep-alive every 15 s, no replay |

- **Guards**: loopback Host; loopback Origin, no cross-site fetch and `application/json` on POST; body and listing-text caps; errors are JSON `{ error: { code, message } }`.
- **DEMO SHORTCUT**: the server holds the delegator's throwaway key and signs seal, revoke and escalation answers for the shopper. A real deployment keeps that key on the shopper's device. `/api/info` says so.
- **Laya down**: the server still starts; the judge answers ERROR and the engine escalates (R10.unavailable). `JUDGE_PROVIDER=replay` and `PLANNER_PROVIDER=replay` are labelled operator switches.

## Rules the tests hold
- Every figure goes through `Num` with a provenance chip; no bare numbers.
- Money is integer minor units; times are HKT for display only.
- Mock outputs say SIMULATED; typed text meets a keyword stand-in, not Laya.
