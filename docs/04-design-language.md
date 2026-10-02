# 04 Design language: Sealed packet, honest receipt

## Registers
| | PACKET | LEDGER |
|---|---|---|
| For | mandate creation, the delegator's view | recorded decisions, logs, verifier, evidence |
| Feel | warm paper, tactile, vermilion and brass, EN then zh-HK | cool neutral, hairlines, monospace data, tabular numerals |

- **Rule**: the delegator holds the packet, the system writes the receipt; a register changes at a component edge, never inside one. `data-register="packet|ledger"` sets the semantic tokens (`--bg`, `--fg`, `--radius`, `--font-data`).

## Provenance chips
- **No bare number.** Every figure renders through `Num` (value + `ProvChip`); a column with one provenance may carry the chip in its header. Never MEASURED for a vendor figure such as Jev latency [F11]. UNKNOWN rows show text, no number.

| Chip | Text | Look | Maps from register status |
|---|---|---|---|
| OBSERVED | `OBSERVED(<date time UTC+8>, <source>)` | teal, filled dot | OBSERVED |
| SIMULATED | `SIMULATED` | inverse fill, hatched edge, largest chip | SIMULATED |
| MEASURED | `MEASURED(n=<count>)` | blue, tick | MEASURED |
| ASSUMED | `ASSUMED` | brown-grey, dashed edge | ASSUMED; READ-BY-CLAUDE and VENDOR-REPORTED with a suffix |

## State semantics
| State | Colour | Icon | Text |
|---|---|---|---|
| MINTED | green `--minted` | check in rounded square | `MINTED`, limit, TTL |
| STOPPED | red `--stopped` | octagon | `STOPPED <rule ID>` |
| ESCALATED | amber `--escalated` | hourglass | `ESCALATED <rule ID>`, countdown to R11 [F31] |
| PENDING | grey `--pending` | dashed square | `PENDING` |

- **Colour never alone.** Brass carries no state; amber carries only ESCALATED.

## StopBanner
- Full width, `role="alert"`, text = rule template + recorded inputs. Example: "Stopped by R3. Total HK$550 is over the HK$541 left." [F22, F21]. Other texts: templates in 01 §Stop catalogue, keyed by the template IDs in 00-context. Each template supplies EN and zh-HK lines.

## Components
| Component | Register | Props | Behaviour |
|---|---|---|---|
| MandateEditor | PACKET | `value, compiled: RuleChip[], onSeal` | Sentence beside editable rule chips; Seal disabled while a chip is invalid |
| PacketMeter | PACKET | `packet: PacketState` | Remaining bar in an envelope outline; drops on mint, restores on VOIDED or EXPIRED |
| CartCard | PACKET | `cart: Cart` | Lines, shipping, fees, FX, total (the figure R3 compares) |
| DecisionCard | LEDGER | `decision: Decision, judge?: JudgeRecord` | Rule ID, inputs, comparator, judge probabilities, outcome; template text only |
| StopBanner | LEDGER | `decision, templateId` | Full width; sentence from template + recorded inputs |
| CardTicket | PACKET | `card: CardRecord` | Masked last4, limit, TTL, state; SIMULATED stamp always on |
| RevokeButton | PACKET | `onRevoke` | Hold `--dur-hold`; early release cancels; keyboard holds Space or Enter |
| LogTimeline | LEDGER | `entries: LogEntry[]` | Mono rows: seq, kind, outcome, rule IDs, hash prefix |
| VerifierPanel | LEDGER | `entries, keys, head` | Pass, or first failing seq; Tamper flips one byte of a copy |
| EvidenceCharts | LEDGER | `harness: HarnessResult, manual: ManualRoute` | B0, B1, B2 bars with n; no value without a chip |
| PresenterBar | LEDGER | `step, mode, onStep, onReset, onMode` | Step DM1 to DM9, Reset, SIMULATED/REAL toggle (06) |

- Types from `schemas/`. `RuleChip`, `HarnessResult`, `ManualRoute`, `ProvChip`, `Num` are UI names owned by lane C.

## Screens
| Screen | Register | Content |
|---|---|---|
| Seal | PACKET | MandateEditor over a PacketMeter preview; Seal writes `MANDATE_SEALED` |
| Run | LEDGER under a PACKET header | Lanes planner, judge, engine, rail; CartCard in, DecisionCard out, StopBanner pinned above; latency chips MEASURED(n=1) |
| Packet console | PACKET | PacketMeter, CardTickets, open escalation, RevokeButton |
| Log + verifier | LEDGER | LogTimeline, VerifierPanel, Tamper button |
| Evidence | LEDGER | EvidenceCharts, manual-route table (E3), OBSERVED captures (E5), the one real decline |
| Presenter | both | Big screen: Run two thirds, PacketMeter one third; numerals `--fs-6` up; PresenterBar bottom; rail badge top right |
| Phone | PACKET first | One column, 360 px; tabs Packet, Run, Log; Seal and Revoke in thumb reach; StopBanner above the fold |

## Tokens
- **Fonts**: system sans; self-hosted Noto Sans HK subset for CJK, `lang="zh-HK"` on every Chinese run; mono for logs and hashes; figures use `--num`.

```css
/* tokens.css. Ratios in comments are light/dark, from the contrast script.
   light-dark() needs a current browser: test the demo laptop and phone. */
:root { color-scheme: light dark; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }

:root {
  /* PACKET */
  --paper:        light-dark(#FBF4E8, #1C1410);
  --paper-raised: light-dark(#FFFBF3, #2A1E18);
  --ink:          light-dark(#2A1C16, #F6EBDC);  /* on paper 15.1/15.4 */
  --ink-soft:     light-dark(#5E4838, #CDB9A5);  /* 7.8/9.6 */
  --vermilion:    light-dark(#A32F18, #EE7A5C);  /* text and UI on paper 6.5/6.5 */
  --on-vermilion: light-dark(#FFF6E8, #2A0F08);  /* on --vermilion 6.6/6.5 */
  --brass-text:   light-dark(#6F5309, #E0BD62);  /* 6.6/10.0 */
  --brass-line:   light-dark(#8F6E14, #C9A24B);  /* UI on paper 4.4/7.6 */
  --brass-fill:   light-dark(#C9A24B, #8F6E14);  /* decorative, never under text */
  --meter-track:  light-dark(#EADBC0, #3A2B22);  /* --vermilion on track 5.2/4.9 */

  /* LEDGER */
  --ledger-bg:       light-dark(#F2F5F7, #0E141A);
  --ledger-surface:  light-dark(#FFFFFF, #161E26);
  --ledger-ink:      light-dark(#14202B, #E8EDF2);  /* on bg 15.1/15.7 */
  --ledger-ink-soft: light-dark(#44515D, #A9B6C2);  /* 7.4/9.0 */
  --line-strong:     light-dark(#6F7B86, #7A8896);  /* control borders 3.95/5.1 */
  --hairline:        light-dark(#D6DCE2, #2B3641);  /* decorative only */
  --chart-b0:        light-dark(#44515D, #A9B6C2);  /* hatched; 8.1/8.1 on surface */
  --chart-b1:        light-dark(#1B4C9B, #9DBEFF);  /* 8.2/9.0 */
  --chart-b2:        light-dark(#14202B, #E8EDF2);  /* 16.5/14.3 */
  --focus:           light-dark(#1B4C9B, #9DBEFF);  /* ring on any surface 7.5/9.7 */

  /* STATE: text and icon on own tint and on all four surfaces, 5.5 or better */
  --minted:       light-dark(#14663A, #63D08F);
  --minted-bg:    light-dark(#E2F3E7, #12301F);
  --stopped:      light-dark(#B3261E, #FF8F85);
  --stopped-bg:   light-dark(#FCE8E6, #3B1714);
  --on-stop:      light-dark(#FFFFFF, #2B0A07);   /* banner text on --stopped 6.5/8.3 */
  --escalated:    light-dark(#8A5200, #F4B650);
  --escalated-bg: light-dark(#FFEFCF, #3A2A0C);
  --pending:      light-dark(#505C67, #A9B6C2);
  --pending-bg:   light-dark(#E8ECEF, #222B34);

  /* PROVENANCE chips: text on own tint, 6.8 or better */
  --obs:  light-dark(#0B5963, #6FD0DB);  --obs-bg:  light-dark(#DDF1F3, #0F3036);
  --meas: light-dark(#1B4C9B, #9DBEFF);  --meas-bg: light-dark(#E4ECFB, #172B52);
  --asm:  light-dark(#5A4726, #DCC79A);  --asm-bg:  light-dark(#F1EBDB, #352B17);
  --sim:  light-dark(#FFFFFF, #14202B);  --sim-bg:  light-dark(#24303B, #E8EDF2);  /* 13.5/14.0 */

  /* Type: 1.25 scale; fs-5 to fs-7 are numerals and presenter sizes */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans HK", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --num: tabular-nums lining-nums;                /* font-variant-numeric */
  --fs-s: 0.8125rem;  --fs-0: 1rem;      --fs-1: 1.25rem;   --fs-2: 1.5625rem;
  --fs-3: 1.9375rem;  --fs-4: 2.4375rem; --fs-5: 3.0625rem; --fs-6: 3.8125rem; --fs-7: 4.75rem;
  --lh-tight: 1.15; --lh-body: 1.5; --lh-zh: 1.7;

  /* Space, shape */
  --sp-1: 0.25rem; --sp-2: 0.5rem; --sp-3: 0.75rem; --sp-4: 1rem;
  --sp-5: 1.5rem;  --sp-6: 2rem;   --sp-7: 3rem;    --sp-8: 4rem;
  --tap: 2.75rem;                                 /* 44px minimum target */
  --r-packet: 14px; --r-ledger: 2px; --r-chip: 4px;
  --shadow-packet: 0 1px 0 rgb(0 0 0 / .06), 0 8px 18px -10px rgb(42 28 22 / .35);

  /* Motion */
  --ease-out:   cubic-bezier(0.22, 1, 0.36, 1);
  --ease-stamp: cubic-bezier(0.2, 0.9, 0.3, 1.15);
  --dur-seal: 420ms; --dur-mint: 320ms; --dur-stop: 200ms; --dur-expire: 800ms;
  --dur-hold: 1200ms;                             /* functional, kept under reduced motion */
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-seal: 0ms; --dur-mint: 0ms; --dur-stop: 0ms; --dur-expire: 0ms; }
}

[data-register="packet"] { --bg: var(--paper); --surface: var(--paper-raised); --fg: var(--ink);
  --fg-soft: var(--ink-soft); --accent: var(--vermilion); --radius: var(--r-packet); --font-data: var(--font-sans); }
[data-register="ledger"] { --bg: var(--ledger-bg); --surface: var(--ledger-surface); --fg: var(--ledger-ink);
  --fg-soft: var(--ledger-ink-soft); --accent: var(--ledger-ink); --radius: var(--r-ledger); --font-data: var(--font-mono); }
```

## Accessibility
- **Checked** with a throwaway Python script (WCAG 2.x relative luminance): every text/background and UI pair, light and dark, on all four surfaces. Kept: text at 4.5:1 or better, UI at 3:1 or better. Lowest text pair 5.55:1 light, 5.84:1 dark; lowest UI pair 3.95:1 light, 4.46:1 dark. Hairlines, `--brass-fill` and disabled controls carry no meaning and sit outside the set.
- **Targets** at least `--tap` (44 px), 8 px apart; **focus** ring 3 px `--focus`; inputs 16 px.
- **Live regions**: StopBanner `role="alert"`, MINTED `role="status"`, countdown announced at start and end only.
- **Reduced motion**: durations 0 ms; state still shows colour, icon, text; hold-to-confirm fills in steps.
- 200% zoom holds; no hover-only content.
- [ ] Lane C adds a token test with the same floors.

## Motion
| Event | Motion |
|---|---|
| Seal | square chop presses 1.06 to 1, flap closes (`--dur-seal`, `--ease-stamp`) |
| Mint | meter bar shortens by the minted amount, CardTicket fades in 8 px (`--dur-mint`) |
| Stop | banner height expands once, meter holds still (`--dur-stop`) |
| Expire | linear bar drains, ticket greys (`--dur-expire`) |

- One motion per event; no loops, confetti or sound. Reduced motion makes each instant.

## Microcopy
- **Rules**: plain English, zh-HK on the second line; name the rule ID and the next step; glossary terms only (00-context), no synonyms; no "AI magic" or chat voice. Decisions: rule templates only.

| Where | EN | zh-HK |
|---|---|---|
| Seal button | Seal packet | 封利是 |
| MINTED | One-off card, limit equals the cart total | 一次性卡，額度等於購物車總額 |
| Rail badge | SIMULATED rail. No money moves. | 模擬發卡層，沒有款項轉移 |
| Verifier fail | Chain broken at entry {seq} | 紀錄鏈於第 {seq} 筆中斷 |

- Open (C-12): native zh-HK read of these strings. The 01 templates are EN only, so zh-HK template lines are owed.

## Deck
- 16:9, **one idea per slide**, numerals at `--fs-6` or larger, each with its chip.
- Same two registers: PACKET for the delegator's story, LEDGER for proof.
- No stock imagery, robot clip-art or logos.

## Branding guard
- **Accent** (state colours aside): deep, brownish vermilion `--vermilion` with brass `--brass-line`; no signal red, no orange-yellow; brass stays outline and rule, never a large fill.
- **Motif**: envelope outline with flap, square chop seal (封). No two overlapping circles, in charts or the deck.
- **Excluded**: logos, wordmarks or lookalikes of HKT, Tap & Go or Mastercard; purple gradients; glassmorphism; emoji.
- **Footer** on every screen and slide: "Prototype. Not affiliated with HKT, Tap & Go or Mastercard."
- [ ] Before the freeze [F41], compare the palette with the sponsor's and card network's public pages (not sampled from them).
