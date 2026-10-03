# 06 Demo script

## Roles
- **Talker**: speaks, owns the clock, no keyboard; says **SIMULATED** for the rail, merchant stub, flagged seller and amounts [F20-F23].
- **Driver**: runs Budget or the Presenter (Space or Right arrow steps, R resets).
- **Rota**: one person at the booth throughout; none present means disqualified [F14].

## Booth: 3-minute script [F45]
| Time [F45] | Driver (Budget, Demo scenarios) | Talker (words in 07) | Moment |
|---|---|---|---|
| 0:00-0:25 | Budget open, "Hi, I'm Wally" | Hook; rail SIMULATED | none |
| 0:25-1:05 | Card tab: Shop charges more | Rules signed, R1 verified. Wally picks, logged. One-off card for HK$259, HK$541 left [F21]. Overshoot declined, exact charge authorised, replay declined | DM1, DM2 |
| 1:05-2:10 | Stops tab: A seller with scam reports; Shipping tips it over; A listing that gives orders | R9: no card. HK$550 over HK$541 [F22]: R3. The judge scores the injection; R10 stops it | DM3, DM4, DM5 |
| 2:10-2:40 | Proof checks itself; Try changing one receipt; Put it back; Evidence | One signed receipt per decision; one changed receipt fails. Rules only vs Wally [F69] | DM7, DM8 |
| 2:40-3:00 | About | Limits and the ask | DM9 |

- **Said aloud**: Laya judges, Qwen plans; neither reads raw pages or does arithmetic; the rules and the rail limit use no model.
- **Plain words** by default; `?dev=1` shows ids and hashes. A changed receipt copy shows a banner until Put it back.

## Hands-on station
- **After 3:00** [F45] the judge drives; the Talker answers.
- **Demo scenarios** (Budget, tabs Buy, Stops, Card, Budget): one tap each, and each buys what it needs first.
- **Ask Wally**: type or speak a request (English, Chinese, Cantonese); the rules decide; a repeat buys nothing.
- **Show Wally a photo**: Home or Ask, the camera button. A plain garment photo gives words and four SIMULATED items; one tap asks Wally to buy, and the rules decide as for any ask. It names the kind of garment, not the photo [F68a]; on the on-device page the shopper taps the kind.
- **Try to trick Wally**: text reaches the judge only; expect Stopped before paying (`R10.injection`); padded or Chinese text escalates [F26, F104].
- **See cheaper options** after the shipping stop: Wally replans over the three demo clothes and buys the ankle socks (HK$120 [F23]) if they fit what is left; the new cart is checked again.
- **Needs your OK** (a seller Wally cannot verify): Approve mints; No thanks or 60 s of silence [F31] stops it (DMR2); a fixed rule never yields.
- **Cancel this budget** (DMR1): Manage this budget, hold, confirm. Unused cards stop; receipts stay.
- **Mum's budget**: Demo scenarios, or Seal then Whose money. Her HK$1,000 caps a HK$800 budget; HK$1,500 is refused `EXCEEDS_PARENT` [F93].
- **Phones**: About or Presenter shows a QR [F92].
- **Fail closed**: the worst case is Stopped or Needs your OK. **Reset** after every judge.

## Finalist run (top 8): 5 + 2 min [F14, F42]
| Time [F70] | Moment | Driver (Presenter) |
|---|---|---|
| 0:00-0:40 | Hook | deck 1-3 |
| 0:40-1:00 | DM1 seal | Step |
| 1:00-1:35 | DM2 mint, overshoot, replay | Step x3 |
| 1:35-2:30 | DM3, DM4, DM5 | Step x3 |
| 2:30-2:38 | DM6 HK$120 [F23], cut first | Step |
| 2:38-3:00 | DM7 Proof checks itself, change one receipt, put it back | Step |
| 3:00-3:30 | DM8 rules only vs Wally, where it breaks | deck 9 |
| 3:30-4:15 | Who pays, who does what | deck 10 |
| 4:15-4:45 | DM9 path to HKT in plain words; hallway result | deck 11 |
| 4:45-5:00 | Team | deck 12 |

- **Q&A**: DMR1 (Cancel), DMR2 (let an escalation expire [F31]) on request. Slides 4, 5, 8 are stills if the app fails. **Behind**: cut DM6, then DM8 to one chart.

## Pre-demo checklist
- [ ] `pnpm booth`: starts Laya and Qwen, one warm-up each (slow first call [F26]), then the booth; the Mac stays awake while it runs. Open `/?booth=1` (no first run; a fresh phone taps Skip, Skip tour). About names the planner.
- [ ] `pnpm demo:reset`: HK$800 [F20], no cards, SIMULATED note on every screen
- [ ] Network off: the booth runs. Stop Laya once, see Needs your OK (`R10.unavailable`), restart, warm up
- [ ] LAN: `WALLY_PUBLIC_URL=https://wally-dev.vercel.app pnpm demo:lan`. A judge who scans the Wi-Fi code gets their own HK$800 practice wallet; the second code (works anywhere) opens the practice copy. Reset and `pnpm demo:reset` touch only the Mac's wallet. Rehearse with `node scripts/sessions-crowd.mjs --port 8787`; `curl -s http://127.0.0.1:8787/api/lan` counts live wallets. Phones reach the Mac (else a hotspot); firewall Allow once
- [ ] A plain garment photo on the phone and the Mac (`data/raw/demo-photos/` is gitignored)
- [ ] On power; notifications off; mirrored
- [ ] Video on laptop and phone; `?api=local` page ready; four rehearsals [F41]; submit before Sun 13:00 HKT [F16, F18]

## Fallbacks
| Failure | Driver switch | Talker says |
|---|---|---|
| Laya down or slow | Needs your OK shows; restart and warm up, else `JUDGE_PROVIDER=replay` (labelled) | The checker is down, so Wally asks me. By design. |
| Qwen down or no pick | `PLANNER_PROVIDER=rule`, else `replay` (labelled) | Wally could not pick, so nothing was decided. |
| Phones cannot join | Drive from the Mac | Same app, same rules. |
| Server or UI bug | Reset; else the on-device page; else the video | Here is the recorded run. |

## Reset
- `pnpm demo:reset` or About, Start the demo over: HK$800 [F20], no cards, new keys, step 0; the profile is cleared.
- **REAL** (Presenter) replays the one OBSERVED decline [F40], read-only; disabled until `data/real-card-test.md` holds one. If H12 fires [F41], say "sim only".
