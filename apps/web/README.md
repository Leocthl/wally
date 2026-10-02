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
| `pnpm --filter @laisee/web e2e` | Playwright smoke test on phone and desktop (builds, serves on 127.0.0.1:4517, uses the cached Chromium) |

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
