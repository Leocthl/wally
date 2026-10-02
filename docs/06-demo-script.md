# 06 Demo script

## Roles
- **Talker**: speaks, owns the clock, no keyboard. Says **SIMULATED** aloud for the rail, merchant stub, flagged seller and every amount [F20-F23].
- **Driver**: runs PresenterBar (Step, Reset, mode toggle); calls fallbacks aloud, nothing else.
- **Cut order** when behind: DM6, the REAL flip in DM2, then DM8 to one chart. DM3 to DM5 and DM7 stay.

## Choreography
| Time [F42, F70] | Screen | Driver action | Talker line | Moment | Evidence |
|---|---|---|---|---|---|
| 0:00-1:00 | Deck 1-3 | Open Seal | A lai see is fixed, sealed, given once. Ours checks the shop first. SIMULATED rail. | none | SR1 |
| 1:00-1:25 | Seal | Compile M0, press Seal | Limit in plain words; chips are the enforced rules. HK$800 [F20], SIMULATED. | DM1 | SR2, E1, E4 |
| 1:25-2:15 | Run, Packet console | Step (mint); Step (overshoot); flip REAL if captured, then back; Step (pay) | Planner proposes, engine approves HK$259. One-off card, exactly that: HK$541 left [F21]. The shop charges more: the rail declines, limit held (SIMULATED). Real: our one captured decline [F40]. Exact charge: authorised. | DM2 | SR1, SR3, E2 |
| 2:15-2:40 | Run | Step | Seller flagged, stopped by R9. The card never exists. SIMULATED fixture. | DM3 (S2) | SR4, E2 |
| 2:40-3:05 | Run | Step | HK$550 with shipping is over the HK$541 left [F22]: stopped by R3. No card exists. | DM4 (S1) | E2, E4 |
| 3:05-3:30 | Run | Step | Injected listing text gives orders. Judge scores it; engine stops it by R10. | DM5 (S3) | E2 |
| 3:30-3:38 | Run | Step; skip if behind | A clean cart still mints: HK$120 [F23]. | DM6 | SR3 |
| 3:38-4:00 | Log + verifier | Verify (pass), Tamper, Verify (fail), Restore | One signed entry per decision. Flip one byte: verification fails. | DM7 | E1, E4 |
| 4:00-4:15 | Evidence | Chart, then manual-route table | Read B0 and B2 overspend and n off the screen. Each number wears its chip. | DM8 | E3, E5 |
| 4:15-4:45 | Deck 9 | none | Where it breaks: SIMULATED rail, no cancel after payment [F2], loss rule v0 says who pays. | DM9 | DIR11 |
| 4:45-5:00 | Deck 10 | none | One-page API ask. A proposal, not an HKT commitment. | DM9 | DIR11 |
| Q&A | Packet console, Run | Hold Revoke before first use; let an escalation expire [F31] | Revoked: card voided. Unanswered: R11 stops it. | DMR1, DMR2 | DIR5, DIR6 |

- **Overshoot** (DM2): merchant stub mode `overshoot`, then `honest` (02 §10). The card stays ACTIVE after the decline.
- **Slides 4-8** in [07](07-pitch.md) are stills of these screens. Use them only if the live screens and the recording both fail.

## Pre-demo checklist
- [ ] Rail badge SIMULATED on every screen; PresenterBar on SIMULATED
- [ ] `pnpm demo:reset` run; packet HK$800 [F20], zero cards
- [ ] Pre-warmed run cached, labelled "replayed"
- [ ] Judge reachable, else `JUDGE_PROVIDER=llm`; shadow results saved
- [ ] Second network link ready; verifier opens offline
- [ ] Fixtures loaded: flagged seller (SIMULATED), injected listing, shipping-overflow cart
- [ ] Real-card capture present, or the REAL line cut; backup recording on laptop and phone
- [ ] Display mirrored, notifications off; table and clock at hand
- [ ] Four timed rehearsals done [F41]

## Fallbacks
| Failure | Trigger | Driver switch | Talker says |
|---|---|---|---|
| Network down | Any call fails | Replay: cached outputs, banner "replayed" | Network is down; this run is replayed. |
| Jev down | Judge call times out [F34] | Adapter uses the `llm` provider; if both fail, show recorded shadow results (labelled "recorded") | Judge is on the fallback. |
| LLM latency | No cart after the talker line | Replay the pre-warmed run (cached planner output, "replayed"). A planner timeout [F33] fails closed (I5), not a demo stop | Planner is slow; replaying an earlier run. |
| Rail-sim bug | Wrong meter, card or decline | Play the backup recording from the same moment | Rail bug; here is the recorded run. |

## Backup recording
- **One full run**, DM1 to DM9 at the F42 pace, burned-in label "recorded", SIMULATED badge visible.
- The talker says "recorded" at the switch. Re-record after the freeze [F41].

## Reset
- `pnpm demo:reset` (TBD until scaffold), run before each rehearsal and the slot: packet to HK$800 [F20], zero cards, log and escalations cleared, fixtures reloaded, demo keys regenerated, PresenterBar at step 0 in SIMULATED. Never touches `data/` captures.

## SIMULATED / REAL toggle
- **SIMULATED** (default) is the only mode that runs engine and rail-sim.
- **REAL** replays the one OBSERVED decline from the real-card test [F40]: read-only, redacted (I8), timestamp chip shown, never a live rail.
- **Disabled** ("no capture yet") until `data/real-card-test.md` holds one. If the H12 trigger [F41] fires, cut the REAL line and say "sim only".
