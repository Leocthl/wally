# apps/web

- **What**: the booth UI (Vite + React 19), mobile first, EN with a zh-HK second line. The rail is SIMULATED on every screen.
- **Three clients, one interface** (`ApiClient`, `src/api/types.ts`): `HttpApiClient` (`src/api/http/`, live mode) when the booth server answers `/api/info`, else `LocalApiClient` (`src/api/local/`, on-device mode: the real engine, log and SIMULATED rail in the page, recorded planner and judge answers, no network, a note on screen). `?api=local` or `VITE_API=local` forces on-device mode; `?api=mock` is for tests. `MockApiClient` is a UI-test double only. All pass `test/apiClientContract.ts`.
- **What the booth can do** (`info().features`): `ask` shows the typed field in the Ask sheet (on-device it knows the sample asks only and says so), `alternatives` shows "See cheaper options" after a budget stop, `compile` says who reads the Seal sentence (`model` or the fixed `rules`). `exportLog()` (live and on-device) adds Receipts > Export for the offline verifier.
- **Portable backend** (`src/booth/backend/`): the booth runner, session and `OrchestratorBackend`, no `node:` import; the server and `LocalApiClient` both run it. Key design for the phone: `src/api/local/KEYS.md`.
- **Booth server** (`server/`, Hono, 127.0.0.1 only unless LAN mode): `pnpm demo` from the repo root (preflight, build if needed, start), then open the printed URL. `pnpm demo:reset` resets keys, logs and the packet. `pnpm demo:lan` is the same server for phones on the Wi-Fi (section below).
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
| `#/styleguide/variants/home`, `#/styleguide/variants/seal` | dev only: the variant pickers (below); not in the production bundle |

- **Old addresses**: `#/run` goes to Wally, `#/console` to Budget `?focus=console`, `#/log` to Receipts; `?decision=` reads as `?d=`. Each is replaced in the address bar.
- **Shell** (`src/shell/`): top bar with the SIMULATED note, tab bar with the raised Ask button, Ask and About sheets, connection banners. Screens load as separate chunks.
- **State**: `src/state/booth.ts` is a pure fold of trace events; a new seal (a new log) starts it over.

## Booth server
| Route | Does |
|---|---|
| `GET /api/info`, `/api/snapshot`, `/api/log`, `/api/export`, `/api/health` | state; export = JSONL log, public keys in use, checkpoint for the verifier page, and for a budget from Mum's her credential (`parentCredential`, saved as `parent-credential.json`) |
| `GET /api/family` | Mum's ceiling and what she has left (family budget, `info.features.family`); `POST /api/seal` with `family: { parent: "mum" }` seals inside it or answers 422 `EXCEEDS_PARENT` with `details` `{ field, requested, allowed }` |
| `POST /api/seal`, `/api/scenario/:id`, `/api/propose`, `/api/revoke`, `/api/escalation/answer` | pipeline runs (`data/scenarios/booth.json`) |
| `POST /api/ask`, `/api/alternatives` | a typed request; "See cheaper options" after a budget stop. Both are runs; a repeat of a live cart returns the earlier decision (`duplicate`) |
| `POST /api/compile` | Seal sentence to rule chips; not a run, seals nothing |
| `POST /api/verify`, `/api/tamper`, `/api/restore`, `/api/reset` | log demo and reset |
| `GET /api/events` | SSE trace; ready comment, ids, keep-alive every 15 s, no replay |
| `GET /api/lan` | LAN mode only, and only to a page on the Mac itself (loopback Host and peer; 404 for everyone else): `{ lan, token, urls[], qrSvg[] }` |

- **Guards**: loopback Host; loopback Origin, no cross-site fetch and `application/json` on POST; body and listing-text caps; errors are JSON `{ error: { code, message, details? } }`. LAN mode widens Host and Origin and adds the pairing token (below).
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

## Phones on the booth Wi-Fi
- **Start**: `pnpm demo:lan` from the repo root: preflight with the LAN checklist (`node scripts/booth-check.mjs --lan` alone prints just that), build if needed, server on `0.0.0.0:8787`, LAN mode ON. `PORT` works; `HOST` names another bind and any non-loopback `HOST` also turns LAN mode on. Without `--lan` or `HOST` nothing changes: 127.0.0.1 only, no token.
- **Show the code**: open `http://127.0.0.1:8787/#/booth` on the Mac. About (the info button) and Presenter show "Open Wally on your phone": a QR code, the links, Copy link and a "LAN mode is ON" chip. Nothing shows on any other page, or when LAN mode is off (`/api/lan` is a 404 there).
- **Phone**: scan with the camera and tap the link. `/?t=<token>` sets a cookie (`wally_t`, HttpOnly, SameSite=Strict) and redirects to `/` without the token. The phone must be on the same Wi-Fi as the Mac. The `.local` link works on iPhones; some Android phones need the IP link.
- **Token**: 128 random bits, new on every server start, so a restart means scanning again. Every `/api/*` call needs it (header `X-Wally-Token` or the cookie) except `/api/health`; the app files need none. The Mac's own pages need none (loopback Host and peer). Wrong or missing: 401 JSON. No other hardening: plain http, one shared token.
- **Host and Origin**: Host must be loopback, one of the Mac's non-internal IPv4 addresses, its hostname or `<hostname>.local`, any port. A POST Origin must be the page's own address, a loopback page, or a native shell (`capacitor://localhost`, `http://localhost`, `https://localhost`). Those three get CORS: the origin is echoed (never `*`), headers `content-type, x-wally-token`, `X-Event-Seq` exposed.
- **macOS firewall**: the first start may ask to let `node` accept incoming connections. Click Allow, once, on the Mac. If a phone times out, check System Settings, Network, Firewall.
- **Wi-Fi client isolation**: venue and hotel Wi-Fi often stops phones from reaching other devices. The page never loads, or `/api/health` times out from the phone. Use the Mac's own network (System Settings, General, Sharing, Internet Sharing) or a phone hotspot that the Mac joins.
- **Add to Home Screen** (iOS): works over http as a web clip with an icon and full-screen launch. Plain http is not a secure context: no service worker, no install prompt, no offline mode. The clip may start without the pairing cookie and then shows on-device mode: open the QR link in Safari instead.
- **Native app**: About, "Connect to the booth Mac". Paste the link (Copy link on the Mac, then Universal Clipboard on an iPhone). Only a 192.168, 10, 172.16 address, loopback or a `.local` name is accepted. The Mac is asked for `/api/info` with the token first; only an answer saves the address (`wally:server`, `wally:token`) and reloads into live mode. The first call on an iPhone shows the local network permission prompt: Allow, then Connect again. "Disconnect" goes back to on-device mode. Native config: `apps/mobile/README.md`.
- **Browser storage keys**: `wally:token` (session storage; local storage in the native app), `wally:server` (local storage, native app only). A page address with `?t=` (a dev server in front of the booth server) is read once and cleaned.

## Design decisions (polish lane A)
- **Variant pickers (dev server only)**: `WALLY_API_PORT=<your booth port> pnpm --filter @laisee/web dev`, then open `http://127.0.0.1:5173/?api=local#/styleguide/variants/home` (or `/seal`). Keys `1`-`3` or arrows flip, `R` replays, `?v=2` keeps the choice, `?chrome=0` hides the scene strip. `import.meta.env.DEV` guards the import, so the pickers and the losing variants are not in `dist/` or the PWA precache (checked: no `proto-picker` and no variants chunk in a production build). The dev server boots again: `vite.config.ts` stubs `node:fs` and `node:path` for the browser graph in dev only, and `WALLY_API_PORT` points its `/api` proxy at your own booth server instead of 8787.
- **Budget hero** (`/variants/home`): Greeting shipped, over Ring and Action first.
  - **Greeting**: Wally and a speech bubble above the card; the bubble says what the budget is doing (ready, shopping inside the rules, needs your OK, all used, cancelled, ended) and Wally's face follows. Won because the gap was character and status, not data, and the card's contract (chip, meter, tags, headings) stays as it was.
  - **Ring**: one ring for left, held and spent on a light card. Best in dark and at reading spent against held; lost because a fresh budget is a full empty-looking circle, it drops the brand gradient, and the legend wraps in 繁 and at 360 px.
  - **Action first**: compact card and one-tap tries in the first screen. Best for starting the demo; lost because it repeats Try asking, clips the rule tags and moves the Try asking cards the tests count.
- **Seal moment** (`/variants/seal`): Lock shipped, over Hold and Signature.
  - **Lock**: the padlock closes where you pressed, the haptic fires on the same frame, the card is stamped Signed and the button reads Sealed in green; then the sealed screen takes over (`--dur-ceremony`, 0 under reduced motion).
  - **Hold**: press and hold the lock, the shackle follows the finger. Kept as a prototype; it changes how the key action is done and a judge may not find it.
  - **Signature**: a signature draws across the card. Charming; it loses the padlock, which is the product's picture of "sealed".
- **Libraries**: NumberFlow adopted for the budget amount only (+7.5 kB gzip initial JS, plain text where it cannot run, so tests and old browsers see the same figure). Rejected: **motion** (CSS transitions, `@starting-style` and CSS `linear()` springs cover every motion here and a library would cost 15-30 kB), **base-ui** (the Sheet, Dialog, Segmented and Switch primitives already trap focus, rove and name themselves, and are covered by the UI component tests; swapping them is a rewrite), **Sonner** (one toast at a time, rare; the existing one is 88 lines).
- **Motion tokens added**: `--dur-exit` (leaving is quicker), `--dur-settle`, `--dur-roll`, `--dur-stagger`, `--dur-ceremony`, and the easings `--ease-drawer`, `--ease-settle` and `--ease-pop` (the last two are real springs where CSS `linear()` exists). All are zero under reduced motion; `src/design/motion.ts` mirrors the ones JS needs, with a test.
- **Rules kept**: no `backdrop-filter` (the branding guard bans glass; the sticky Seal bar gets a fade instead), no raw colours or raw durations in component CSS, hover styles only under `(hover: hover) and (pointer: fine)`, and nothing animates on the first paint of a data list.
