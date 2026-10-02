# 04 Design language: Wally

## Look
- **Cool wallet** (D14): light fintech UI, blue primary, teal accent, a wallet character. Red and orange mean stop or error only; amber means Needs your OK only. Colour never works alone: icon and words too.
- **Guards**: no HKT, Tap & Go or Mastercard logos or lookalikes; one gradient, on the budget card and the one-off card; no glass (`backdrop-filter`); no emoji. About carries "Prototype. Not affiliated with HKT, Tap & Go or Mastercard."
- **Warm palette**: `data-palette="warm"` swaps blue for orange to compare with local wallet apps. Not shipped.

## Where it lives
| What | Path under `apps/web/src/` |
|---|---|
| Tokens | `design/tokens.css`; `tokens-warm.css` (optional); `tokens-fallback.css` (generated for browsers without `light-dark()`) |
| Contrast pairs, motion mirrors | `design/contrastPairs.ts`, `design/motion.ts`, both under test |
| Base and primitives | `design/base.css`, `ui/*.tsx`, `design/ui/*.css` |
| Wally | `wally/` |
| Words | `i18n/*.ts`, one `label(en, zh)` per string |
| Style guide | `#/styleguide`: palette with ratios, type, every primitive |

## Tokens
| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-bg` | #F4F7FE | #0B1220 | background |
| `--c-surface` | #FFFFFF | #131C30 | cards, sheets |
| `--c-ink` | #0E1A33 | #EAF0FF | text |
| `--c-ink-muted` | #4F5B78 | #A7B3CF | secondary text |
| `--c-primary` | #1A5CFF | #3366F5 | actions, budget card |
| `--c-accent` | #19C3A6 | #2FD3B6 | teal highlight |
| `--c-ok` | #0B7D41 | #34C77B | approved, card made |
| `--c-warn` | #F2B21B | #F5BE3C | Needs your OK |
| `--c-stop` | #D92D20 | #FF6B5E | Stopped, errors |
| `--c-info` | #2563EB | #5B8CFF | notices |

- **Roles** each have `--c-X`, `--c-on-X`, `--c-X-ink`, `--c-X-tint`. Provenance chips: `--sim`, `--obs`, `--meas`, `--asm` with `-bg`. Budget card gradient `--c-hero-from` to `--c-hero-to` (light #1A5CFF to #0A7396); one-off card `--c-ticket`; Wally `--wally-*`.
- **Type**: system fonts only (the booth is offline). `--font-display` (ui-rounded) for figures, `--font-zh` (PingFang HK, Noto Sans HK, JhengHei; `lang="zh-HK"` on Chinese runs), `--font-mono`. Scale `--text-xs` 0.75 rem to `--text-5xl` 3.75 rem; weights 400 to 800; `--num` tabular numerals; line heights 1.15 to 1.5, zh-HK 1.7.
- **Space and shape**: `--sp-1` to `--sp-8` (0.25 to 4 rem), `--gutter` 1 rem, `--column` 30 rem; targets `--tap` 44, `--tap-lg` 48, `--tap-xl` 56 px; radii `--r-xs` 6 to `--r-xl` 28 px and pill; `--safe-*` for notches.
- **Elevation**: `--shadow-1` rest, `--shadow-2` raised, `--shadow-3` sheet; layers `--z-*` from 10 (sticky) to 60 (toast).

## Motion
- **Durations** (ms): `--dur-press` 120, `--dur-fast` 180, `--dur-base` 260, `--dur-slow` 420, `--dur-sheet` 340, `--dur-exit` 220, `--dur-settle` 380, `--dur-roll` 560, `--dur-stagger` 40, `--dur-ceremony` 900; per event `--dur-seal` 420, `--dur-mint` 320, `--dur-stop` 200, `--dur-expire` 800; `--dur-hold` 1,200.
- **Easings**: `--ease-out`, `--ease-in-out`, `--ease-spring`, `--ease-stamp`, `--ease-drawer`; `--ease-settle` and `--ease-pop` are real springs where CSS `linear()` exists.
- **Rules**: every duration is 0 under reduced motion except the hold, which fills in steps. Tests scan every sheet: no raw colours or durations, loops only in `no-preference`, inputs at 16 px, no glass. Hover styles only on hover pointers. Leaving is quicker than arriving. Nothing animates on the first paint of a list. Haptics where the device has them, off under reduced motion; no sound.

## Wally
- **Character**: a rounded wallet with a darker flap, a clasp, a teal card peeking out and a face. States: idle, thinking, approved (sparks), stopped (brows, shield), offline. Sizes 24 (tab), 48 (row), 96 to 160 (result); below 40 px a mini drawing keeps the face legible. Each state has a spoken name. The same art draws the app icon.
- **Hero** (Budget): Wally and a speech bubble above the budget card. The bubble is the mood: ready, shopping inside the rules, needs your OK, all used, cancelled, ended.

## Components
- **Primitives** (`ui/`): Button, Tag, Card, List, ProgressBar, Ring, TextField, Switch, TopBar, BottomTabBar with a raised Ask button, Segmented, Sheet (follows the finger), Dialog, Steps, Toast, RollingMoney (NumberFlow, budget amount only).
- **Figures** go through `Num` with a provenance chip; no bare numbers, tests count them.
- **Ask sheet**: a typed field, "Try to trick Wally" (listing text, read as data), Try asking shortcuts. A mic sits inside the field only where the browser has a speech recogniser, never in the native shells; the first press says audio may leave the device, and nothing is sent until Send.
- **Libraries**: NumberFlow rolls the budget amount only. motion, base-ui and Sonner were rejected: CSS covers every motion and the primitives already trap focus.
- **Screens**: Budget (hero, rule tags, one-off cards, Recent, Try asking, Manage this budget); Wally (steps, approved card, Stopped before paying, Needs your OK, Why sheet with "Details for nerds"); Seal (Meet Wally, Describe, Check and seal, Sealed); Receipts; Proof; Why trust Wally; Presenter; About.

## Vocabulary
| Engine | The app says | zh-HK (draft) |
|---|---|---|
| packet | budget | 預算 |
| mandate | rules | 規則 |
| seal | Seal budget | 鎖定預算 |
| mint | one-off card | 一次性卡 |
| stop (DENY) | Stopped before paying | 付款前已攔截 |
| escalation | Needs your OK | 需要你確認 |
| revoke | Cancel this budget | 取消預算 |
| log, verifier | Receipts, Proof | 收據, 證明 |
| planner, judge | Wally picks, Wally reads the listing | Wally 揀貨, Wally 睇商品資料 |

- Rule IDs appear only in "Details for nerds". Reasons come from templates, never model text.

## Accessibility
- **Contrast**: `contrastPairs.ts` lists every allowed pair; a test checks each in light and dark (text 4.5:1, UI 3:1).
- **Scans**: axe on every screen and sheet at 390, 360 and 430 px wide, light and dark; no serious or critical finding.
- **Touch**: targets at least 44 px; focus ring 3 px `--c-focus`; text inputs 16 px; stop banners `role="alert"`; countdown announced at start and end.

## Variants
- **Picker**: dev server only (`#/styleguide/variants/...`, keys 1 to 3, R replays); not in the production bundle.

| Screen | Shipped | Over | Why |
|---|---|---|---|
| Budget hero | Greeting | Ring, Action first | the gap was character and status, not data |
| Seal moment | Lock | Hold, Signature | the padlock is the picture of sealed |
| Stopped before paying | Quiet guard | Ghost card, Where it stopped | reason first, a calm path, "no card was made" |
| One-off card | Wallet card | Ticket stub, Live card | the card is the hero, Pay now right under it |
| Needs your OK | Consent sheet | Hold to approve, Permission slip | says what yes does; a hold slows every demo |

## Not done
- zh-HK lines are drafts marked NEEDS-REVIEW; no native read yet (C-12, C-19).
- Noto Sans HK is not bundled. No Tap & Go reference screenshots were supplied; the palette comparison with sponsor pages is owed before the freeze [F41].
- Not run on a physical phone. Voice needs the browser's online speech service, so it is outside the offline claim.
- Legacy token aliases (`--paper`, `--vermilion`) remain for old stylesheets.
