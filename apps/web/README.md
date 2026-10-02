# apps/web

- **What**: the booth UI (Vite + React 19), mobile first, EN with a zh-HK second line. The rail is SIMULATED on every screen.
- **Offline by default**: `MockApiClient` replays the SIMULATED storyline in the browser. No network, no key, no model.
- **Swap point**: the UI talks to `ApiClient` (`src/api/types.ts`) only. An HTTP + SSE client plugs in behind it and must pass `test/apiClientContract.ts`.
- **Stop texts**: `src/explain/renderStop.ts` wraps a stub; lane A's `render` replaces it in one line.

## Run
| Command | Does |
|---|---|
| `pnpm --filter @laisee/web dev` | Vite dev server on 127.0.0.1 |
| `pnpm --filter @laisee/web build` | typecheck and production build |
| `pnpm --filter @laisee/web test` | Vitest: components, mock, reducer, tokens |
| `pnpm --filter @laisee/web exec playwright test` | smoke test on phone and desktop (builds, serves on 127.0.0.1:4517) |

## Screens (hash routes)
| Route | Screen |
|---|---|
| `#/booth` | preset M0 sealed on load, scenario buttons, free-text box, Verify and Tamper |
| `#/seal` | sentence beside editable rule chips, Seal |
| `#/run`, `#/console`, `#/log` | one panel each |
| `#/presenter` | big screen, PresenterBar steps DM1 to DM9 |

## Rules the tests hold
- Every figure goes through `Num` with a provenance chip; no bare numbers.
- Money is integer minor units; times are HKT for display only.
- Mock outputs say SIMULATED; typed text meets a keyword stand-in, not Laya.
