# 08 Risk register

- L/I is likelihood / impact: H high, M medium, L low. Hour marks follow [F41].

| Risk | L/I | Trigger | Mitigation | Owner |
|---|---|---|---|---|
| Laya quality | M/H | Base checkpoints near chance zero-shot; soft probabilities; `escalate_or_proceed` carried no signal in our run [F11c, F26, F50] | Use the `typed-decisions` checkpoint; gate from `scope_fit`, `injection_risk`, `seller_risk`; judge only tightens (I3); hard rules and the rail limit hold with no model; false-allow rate MEASURED on the harness | [TEAM] |
| Laya negation, position bias, calibration | M/M | A negated criterion flips a choice; option order moves close calls; thresholds do not transfer from Jev [F11c, F26] | Positive, semantic labels; rotation averaging on (B-14); thresholds fitted on a split corpus (B-20) and frozen at M5 [F36, F50] | [TEAM] |
| Padding attack | M/H | A long listing pushes an injection past the context; Laya drops it silently [F26] | `usage.truncated` → ERROR → ESCALATE (B-14); padded fixtures in the harness; chunked judging as a stretch | [TEAM] |
| Planner and judge share one model | M/M | One Laya blind spot steers the pick and passes the judge | Engine rules, arithmetic and the rail limit are model-free; planner never reads descriptions; trace logged per decision | [TEAM] |
| Laya server down at the booth | M/H | Crash, restart or slow first call [F26] | Judge ERROR → ESCALATE `R10.unavailable` (I5); warm-up in the pre-demo checklist (06); `replay` planner and judge, labelled; 3-minute video as last resort | [TEAM] |
| Memory or heat on the booth laptop | L/M | Laya footprint [F26] plus browser and dev tools on battery | Laptop on power; close other apps; one Laya process; rehearse on the booth laptop | [TEAM] |
| Chinese listings | M/M | Laya is English-derived and misread Chinese probes [F26] | Listings and judge questions in English; zh-HK only in UI copy | [TEAM] |
| Judges try to break the demo | H/M | Hostile free text, odd buttons, repeated clicks at the booth [F14] | Fail closed: worst case DENY or ESCALATE; Reset on every screen; idle reset; a Laya miss is said aloud and logged (06 §Hands-on) | [TEAM] |
| Repo changes after the freeze | L/H | A push, tag or setting change after Sun 13:00 HKT disqualifies [F16] | Freeze guard (X-18); final push and public check before the deadline (D-26); booth runs from the frozen commit | [TEAM] |
| Originality and credits | M/H | Pre-written code, or an uncredited library or model [F16] | All code written in the 48 h; `THIRD_PARTY.md` and README Credits updated in the same commit (X-19); the team explains every module (07 crib) | [TEAM] |
| Booth unattended | M/H | No one at the booth when judges arrive [F14] | Rota keeps one person at the booth through the exhibition (D-27) | [TEAM] |
| Time pressure | H/H | Submission, video and rehearsals collide in M6 [F41] | Start D-25 early; video recorded after the first clean rehearsal; cut order D9 before cutting the submission | [TEAM] |
| Rail realism | H/M | A judge reads the simulator as real issuing; no issuing API found [F1.api] | SIMULATED label on every rail output (C-14); calibrate on one real decline (D-03); real-versus-simulated table in 02; merchant lock asked in 09 | [TEAM] |
| T&C breach if an agent handles card details | L/H | Any prompt, log or file touches PAN or CVV; the T&C bars disclosing security details [F2.secrecy] | A human types the card in tests; no code path sees PAN or CVV (I8); planner holds no credential (I4); docs-check flags digit runs; the holder runs the test [F2.suspicion] | [TEAM] |
| ToS on probes and Scameter | M/M | No terms cover automated use and the Important Notice limits reproduction [F6]; a store blocks the probe | Manual, human-paced captures only (D-07), no Bulk Search, redacted; probes read-only, no bypass of bot challenges, terms read first | [TEAM] |
| Minors optics | L/M | Pitch or UI reads as aimed at children [F2.plus2] | Adult Gen Z default [F24]; teen chain is the first cut (D9); no minor's data | [TEAM] |
| Merchant pre-auth above the limit | M/M | A store declines although the total is within the limit [F2.preauth] | `preauth` stub mode; false-block rate MEASURED(n); "where it breaks"; `preauth_tolerance` asked in 09 | [TEAM] |
| SIMULATED shown as real (label drift) | M/H | Any rail output, number or slide without a SIMULATED or provenance chip | Chip on every number (04); label audit (C-14); docs-check; honesty slide in 07 | [TEAM] |
| Unobserved numbers (E5) | M/H | A doc shows a rate, fee or limit without a register ID or capture | docs-check on unknown F-IDs; re-capture F1-F3 (D-06) or leave READ-BY-CLAUDE; vendor figures never reported as ours | [TEAM] |
| Sleep and scope creep | H/H | A person works past their slot; work outside TASKS.md; a gate is missed | Rota, one person off 4 h at a time [F41]; scope locked (X-09); cut order D9 | [TEAM] |

## Contingency (D8)
- If the end-to-end stop still fails at H10 [F41], after the H6 cut, switch to Track 4, "overnight desk that escalates" (Jev-native), the second-ranked option [F43]. All lane owners decide together at H10; there is no half-switch. Not planned further here.
