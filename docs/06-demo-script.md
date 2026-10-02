# 06 Demo script

## Roles
- **Talker**: speaks, owns the clock, no keyboard; says **SIMULATED** for the rail, merchant stub, flagged seller and every amount [F20-F23].
- **Driver**: runs the Booth screen (scenario buttons, Reset) or the PresenterBar on stage; calls fallbacks aloud.
- **Rota**: one person at the booth through the exhibition [F14] (D-27).

## Booth: 3-minute script [F45]
| Time [F45] | Driver | Talker (words in 07) | Moment | HKT evidence [F19] |
|---|---|---|---|---|
| 0:00-0:25 | Booth open, M0 sealed | Hook; rail SIMULATED | none | none |
| 0:25-1:05 | Normal purchase, then Replay the card | Credential signed, R1 verified. Laya picks the item, logged. HK$259 token, HK$541 left [F21]. Overshoot declined, exact charge authorised, replay declined | DM1, DM2 | signed credential, single-use token, blocked replay |
| 1:05-2:10 | Flagged seller, Shipping overflow, Injected listing | R9: no card. HK$550 over HK$541 [F22]: R3. Laya scores the injection; R10 stops it | DM3, DM4, DM5 | denied purchase; approve, reject, escalate |
| 2:10-2:40 | Log: Verify, Tamper, Verify; Evidence | One signed entry per decision; one flipped byte fails. Model-only gate vs ours, MEASURED(n) | DM7, DM8 | audit timeline, verifier |
| 2:40-3:00 | none | Limits and the ask | DM9 | rail feasibility |

- **Limits said aloud**: rail SIMULATED; Laya is a third-party model that cannot read raw pages, do arithmetic or write text, so listings are structured and arithmetic is code; planner and judge share one model, so the rules and the rail limit are model-free.

## Hands-on station: "Try to trick the agent"
- **After 3:00** [F45] the judge drives; the Driver points, the Talker answers.
- **Buttons**: normal purchase, flagged seller, shipping overflow, injected listing, off-category item [F29], revoke (DMR1), replay the card, wrong merchant, price drift, rail timeout. Escalation expiry (DMR2) on request.
- **Free text** is the listing description: Laya's judge reads it, the planner never does. Expect DENY `R10.injection` or ESCALATE; padded text ESCALATEs (`usage.truncated` [F26]).
- **Fail closed**: the worst outcome is DENY or ESCALATE; hard rules and the rail limit hold with no model.
- **A miss** by Laya: "the judge can only tighten; the rules held"; add it to the fix list. **Reset** after every judge.

## Finalist run (top 8): 5 + 2 min [F14, F42]
| Time [F70] | Moment | Driver |
|---|---|---|
| 0:00-1:00 | Hook + thesis | deck 1-3 |
| 1:00-1:25 | DM1 seal | Seal M0 |
| 1:25-2:15 | DM2 mint, overshoot, replay | Step x3 |
| 2:15-3:30 | DM3, DM4, DM5 | Step x3 |
| 3:30-3:38 | DM6 HK$120 [F23], cut first | Step |
| 3:38-4:15 | DM7 verify and tamper; DM8 numbers | Log, Evidence |
| 4:15-5:00 | DM9 where it breaks, path to HKT | deck 9-10 |
| Q&A | DMR1, DMR2 on request | Revoke; let an escalation expire [F31] |

- Same app in presenter mode. Slides 4-8 in [07](07-pitch.md) are stills, used only if the live app and the video both fail.
- **Behind**: cut DM6, then DM8 to one chart. DM3-DM5 and DM7 stay.

## Pre-demo checklist
- [ ] `services/laya/serve.sh`, then one warm-up call (slow first call [F26])
- [ ] `pnpm demo:reset`: packet HK$800 [F20], zero cards; SIMULATED badge on every screen
- [ ] Network off: booth runs; stop Laya once, see ESCALATE, restart, warm up
- [ ] Fixtures: flagged seller (SIMULATED), injected and padded listings, shipping-overflow cart; replay fixtures load
- [ ] Real-card capture present, or the REAL line cut; 3-minute video on laptop and phone
- [ ] Laptop on power (Laya memory [F26]); notifications off; display mirrored
- [ ] Four timed rehearsals done [F41]; submission sent before Sun 13:00 HKT; repo public and frozen [F16, F18]

## Fallbacks
| Failure | Trigger | Driver switch | Talker says |
|---|---|---|---|
| Laya down or slow | judge ERROR or past F34 | ESCALATE shows; restart and warm up, else `replay` planner and judge (labelled) | The judge is down, so the engine escalates. By design. |
| Rail-sim or UI bug | wrong meter, token or decline | Reset; else the video from the same moment | Here is the recorded run. |

## Reset
- `pnpm demo:reset` (booth Reset calls it): packet to HK$800 [F20], zero cards, log and escalations cleared, fixtures reloaded, demo keys regenerated, step 0, SIMULATED. Never touches `data/` captures.

## SIMULATED / REAL toggle
- **SIMULATED** (default) runs engine and rail-sim. **REAL** replays the one OBSERVED decline [F40]: read-only, redacted (I8), timestamp chip, never a live rail. Disabled until `data/real-card-test.md` holds one; if H12 fires [F41], cut it and say "sim only".
