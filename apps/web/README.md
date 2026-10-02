# apps/web

- **What**: the booth UI (Vite + React 19), mobile first, EN with a zh-HK second line. The rail is SIMULATED on every screen.
- **Two modes, one interface** (`ApiClient`, `src/api/types.ts`): `HttpApiClient` (`src/api/http/`, live mode) when the booth server answers `/api/info`, else `LocalApiClient` (`src/api/local/`, on-device mode: the real engine, log and SIMULATED rail in the page, recorded planner and judge answers, no network, a note on screen). `?api=local` or `VITE_API=local` forces on-device mode. `MockApiClient` is a UI-test double only. All pass `test/apiClientContract.ts`.
- **Portable backend** (`src/booth/backend/`): the booth runner, session and `OrchestratorBackend`, no `node:` import; the server and `LocalApiClient` both run it. Key design for the phone: `src/api/local/KEYS.md`.
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
| `GET /api/info`, `/api/snapshot`, `/api/log`, `/api/export`, `/api/health` | state; export = JSONL log, public keys in use, checkpoint for the verifier page, and for a budget from Mum's her credential (`parentCredential`, saved as `parent-credential.json`) |
| `GET /api/family` | Mum's ceiling and what she has left (family budget, `info.features.family`); `POST /api/seal` with `family: { parent: "mum" }` seals inside it or answers 422 `EXCEEDS_PARENT` with `details` `{ field, requested, allowed }` |
| `POST /api/seal`, `/api/scenario/:id`, `/api/propose`, `/api/revoke`, `/api/escalation/answer` | pipeline runs (`data/scenarios/booth.json`) |
| `POST /api/verify`, `/api/tamper`, `/api/restore`, `/api/reset` | log demo and reset |
| `GET /api/events` | SSE trace; ready comment, ids, keep-alive every 15 s, no replay |

- **Guards**: loopback Host; loopback Origin, no cross-site fetch and `application/json` on POST; body and listing-text caps; errors are JSON `{ error: { code, message, details? } }`.
- **DEMO SHORTCUT**: the server holds the delegator's throwaway key and signs seal, revoke and escalation answers for the shopper. A real deployment keeps that key on the shopper's device. `/api/info` says so.
- **Laya down**: the server still starts; the judge answers ERROR and the engine escalates (R10.unavailable). `JUDGE_PROVIDER=replay` and `PLANNER_PROVIDER=replay` are labelled operator switches.

## Rules the tests hold
- Every figure goes through `Num` with a provenance chip; no bare numbers.
- Money is integer minor units; times are HKT for display only.
- Mock outputs say SIMULATED; typed text meets a keyword stand-in, not Laya.

## PWA and style guide (lane m-design)
| Item | Detail |
|---|---|
| Style guide | `#/styleguide`: sample screens, Wally, palette with contrast ratios, type, every primitive; EN/繁, light/dark, cool/warm |
| Install | `manifest.webmanifest` (standalone, portrait, `start_url` and `scope` `./`), icons 192/512/maskable 512/SVG, apple-touch 180 |
| Service worker | `src/pwa/sw.ts`, built to `sw.js` by `src/pwa/vitePlugin.ts`; precaches the hashed shell, assets, icons and `offline.html`; never touches `/api` or the SSE stream |
| When it registers | production build, secure context only (https, `localhost`, `127.0.0.1`); `localStorage["wally:sw"]="off"` opts out |
| Updates | a new build waits; the "New version ready" toast reloads into it, so nothing swaps mid-demo |
| LAN booth over http | not a secure context: no service worker, no install prompt; it runs as a normal page and iOS "Add to Home Screen" makes a home-screen icon without offline support |
| Regenerate | `pnpm exec tsx scripts/gen-icons.ts` (icons, favicon, offline page; uses the cached Chromium) and `pnpm exec tsx scripts/gen-token-fallback.ts` |
