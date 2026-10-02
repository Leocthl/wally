# apps/web

- **What**: the booth UI (Vite + React 19), mobile first, EN with a zh-HK second line. The rail is SIMULATED on every screen.
- **Three clients, one interface** (`ApiClient`, `src/api/types.ts`): `HttpApiClient` (`src/api/http/`, live mode) when the booth server answers `/api/info`, else `LocalApiClient` (`src/api/local/`, on-device mode: the real engine, log and SIMULATED rail in the page, recorded planner and judge answers, no network, a note on screen). `?api=local` or `VITE_API=local` forces on-device mode; `?api=mock` is for tests. `MockApiClient` is a UI-test double only. All pass `test/apiClientContract.ts`.
- **What the booth can do** (`info().features`): `ask` shows the typed field in the Ask sheet (on-device it knows the sample asks only and says so), `alternatives` shows "See cheaper options" after a budget stop, `compile` says who reads the Seal sentence (`model` or the fixed `rules`). `exportLog()` (live and on-device) adds Receipts > Export for the offline verifier.
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
| `#/`, `#/budget`, `#/booth` | Budget: what is left, rules, Recent, Try asking, Manage this budget (cards, Cancel); `?focus=console` scrolls to the cards |
| `#/wally` | Wally's screen: shopping, approved (one-off card), stopped, Needs your OK, Why sheet; `?d=<decisionId>` pins one purchase |
| `#/receipts` | the signed log as receipts; `?d=<decisionId>` opens that receipt |
| `#/proof` | Verify, Try to tamper, Restore, Export, How is this checked |
| `#/seal` | first-run steps, or `?mode=topup`, `?mode=edit`, `?mode=welcome` |
| `#/evidence` | Why trust Wally: measured results |
| `#/presenter` | big screen, PresenterBar steps DM1 to DM9 |
| `#/styleguide` | design primitives (outside the shell) |

- **Old addresses**: `#/run` goes to Wally, `#/console` to Budget `?focus=console`, `#/log` to Receipts; `?decision=` reads as `?d=`. Each is replaced in the address bar.
- **Shell** (`src/shell/`): top bar with the SIMULATED note, tab bar with the raised Ask button, Ask and About sheets, connection banners. Screens load as separate chunks.
- **State**: `src/state/booth.ts` is a pure fold of trace events; a new seal (a new log) starts it over.

## Booth server
| Route | Does |
|---|---|
| `GET /api/info`, `/api/snapshot`, `/api/log`, `/api/export`, `/api/health` | state; export = JSONL log, public keys in use, checkpoint for the verifier page |
| `POST /api/seal`, `/api/scenario/:id`, `/api/propose`, `/api/revoke`, `/api/escalation/answer` | pipeline runs (`data/scenarios/booth.json`) |
| `POST /api/ask`, `/api/alternatives` | a typed request; "See cheaper options" after a budget stop. Both are runs; a repeat of a live cart returns the earlier decision (`duplicate`) |
| `POST /api/compile` | Seal sentence to rule chips; not a run, seals nothing |
| `POST /api/verify`, `/api/tamper`, `/api/restore`, `/api/reset` | log demo and reset |
| `GET /api/events` | SSE trace; ready comment, ids, keep-alive every 15 s, no replay |

- **Guards**: loopback Host; loopback Origin, no cross-site fetch and `application/json` on POST; body and listing-text caps; errors are JSON `{ error: { code, message } }`.
- **DEMO SHORTCUT**: the server holds the delegator's throwaway key and signs seal, revoke and escalation answers for the shopper. A real deployment keeps that key on the shopper's device. `/api/info` says so.
- **Laya down**: the server still starts; the judge answers ERROR and the engine escalates (R10.unavailable). `JUDGE_PROVIDER=replay` and `PLANNER_PROVIDER=replay` are labelled operator switches.

## Rules the tests hold
- Budget, Receipts and Proof: every figure goes through `Num` or `Fig` with a provenance chip; no bare numbers. Wally's screen words amounts inside sentences, so each surface (hero, card, story, list) shows its own chip (`figuresOutsideChipSurface`).
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
