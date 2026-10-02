# 06 Demo script

## Roles
- **Talker**: speaks, owns the clock, no keyboard; says **SIMULATED** for the rail, merchant stub, flagged seller and amounts [F20-F23].
- **Driver**: runs Budget or the Presenter (Space or Right arrow steps, R resets).
- **Rota**: one person at the booth throughout [F14] (D-27).

## Booth: 3-minute script [F45]
| Time [F45] | Driver (Budget, Try asking) | Talker (words in 07) | Moment | HKT evidence [F19] |
|---|---|---|---|---|
| 0:00-0:25 | Budget open, "Hi, I'm Wally" | Hook; rail SIMULATED | none | none |
| 0:25-1:05 | Shop charges more (one tap) | Rules signed, R1 verified. Wally picks, logged. One-off card for HK$259, HK$541 left [F21]. Overshoot declined, exact charge authorised, replay declined | DM1, DM2 | signed credential, single-use token, blocked replay |
| 1:05-2:10 | A seller with scam reports; Shipping tips it over; A listing that gives orders | R9: no card. HK$550 over HK$541 [F22]: R3. The judge scores the injection; R10 stops it | DM3, DM4, DM5 | denied purchase; approve, reject, escalate |
| 2:10-2:40 | Proof: Verify receipts, Try to tamper, Restore; Why trust Wally | One signed receipt per decision; one flipped byte fails. Model-only gate against ours [F69] | DM7, DM8 | audit timeline, verifier |
| 2:40-3:00 | About | Limits and the ask | DM9 | rail feasibility |

- **Said aloud**: Laya judges, Qwen plans; neither reads raw pages or does arithmetic; the rules and the rail limit use no model.

## Hands-on station
- **After 3:00** [F45] the judge drives; the Driver points, the Talker answers.
- **Try asking**: every scenario is one tap and buys what it needs first.
- **Ask Wally**: type or speak a request (English, Chinese, Cantonese); the rules decide; a repeat of a live cart buys nothing.
- **Try to trick Wally**: text reaches the judge only; expect Stopped before paying (`R10.injection`); padded text escalates [F26].
- **See cheaper options** after the shipping stop: Wally replans, the new cart meets the judge and rules again.
- **Needs your OK** (a seller Wally cannot verify): Approve mints; No thanks or 60 s of silence [F31] stops it (DMR2); a fixed rule never yields.
- **Cancel this budget** (DMR1): Manage this budget, hold, confirm. Unused cards stop; receipts stay.
- **Mum's budget**: Try asking, or Seal then Whose money. Her HK$1,000 caps a HK$800 budget; HK$1,500 is refused `EXCEEDS_PARENT` [F93].
- **Phones**: `pnpm demo:lan`; About or Presenter shows a QR; scan and tap. The token is new at each start [F92].
- **Fail closed**: the worst case is Stopped or Needs your OK. **Reset** after every judge.

## Finalist run (top 8): 5 + 2 min [F14, F42]
| Time [F70] | Moment | Driver (Presenter) |
|---|---|---|
| 0:00-1:00 | Hook + thesis | deck 1-3 |
| 1:00-1:25 | DM1 seal | Step |
| 1:25-2:15 | DM2 mint, overshoot, replay | Step x3 |
| 2:15-3:30 | DM3, DM4, DM5 | Step x3 |
| 3:30-3:38 | DM6 HK$120 [F23], cut first | Step |
| 3:38-4:15 | DM7 verify, tamper; DM8 numbers | Step x2 |
| 4:15-5:00 | DM9 where it breaks, path to HKT | Step, deck 9-10 |

- **Q&A**: DMR1 (Cancel), DMR2 (let an escalation expire [F31]) on request. Slides 4-8 in [07](07-pitch.md) are stills if the app and the video fail. **Behind**: cut DM6, then DM8 to one chart.

## Pre-demo checklist
- [ ] `services/laya/serve.sh`, `services/qwen/serve.sh`, one warm-up each (slow first call [F26])
- [ ] `pnpm demo` (`pnpm demo:lan` for phones); About names the planner. If Qwen gives the flagged seller no proposal, restart with `PLANNER_PROVIDER=rule`
- [ ] `pnpm demo:reset`: HK$800 [F20], no cards, SIMULATED note on every screen
- [ ] Network off: the booth runs. Stop Laya once, see Needs your OK (`R10.unavailable`), restart, warm up
- [ ] LAN: phones can reach the Mac (else a hotspot); firewall Allow once; scan from one phone
- [ ] On power; notifications off; display mirrored
- [ ] Video on laptop and phone; `?api=local` page ready; four rehearsals [F41]; submit before Sun 13:00 HKT [F16, F18]

## Fallbacks
| Failure | Driver switch | Talker says |
|---|---|---|
| Laya down or slow | Needs your OK shows; restart and warm up, else `JUDGE_PROVIDER=replay` (labelled) | The checker is down, so Wally asks me. By design. |
| Qwen down or no pick | `PLANNER_PROVIDER=rule`, else `replay` (labelled) | Wally could not pick, so nothing was decided. |
| Phones cannot join | Drive from the Mac | Same app, same rules. |
| Server or UI bug | Reset; else the on-device page (real rules, recorded answers); else the video | Here is the recorded run. |

## Reset
- `pnpm demo:reset` or About, Start the demo over: HK$800 [F20], no cards, new keys, step 0.
- **REAL** (Presenter) replays the one OBSERVED decline [F40], read-only; disabled until `data/real-card-test.md` holds one. If H12 fires [F41], say "sim only".
