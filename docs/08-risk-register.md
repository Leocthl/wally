# 08 Risk register

- L/I is likelihood / impact: H high, M medium, L low. Hour marks follow [F41].

| Risk | L/I | Trigger | Mitigation | Owner |
|---|---|---|---|---|
| Jev access | M/H | No key at H2: early access is waitlisted and no hackathon credits were found [F11b] | llm fallback judge on the same schema (B-05) so the demo never depends on Jev; Jev stays behind `JudgePort`; shadow mode first; only public listing text and cart fields leave the machine (US-hosted vendor [F11b], I8); report only latency and cost we measure | [TEAM] |
| Rail realism | H/M | A judge reads the simulator as real issuing; no issuing API found [F1.api] | SIMULATED label on every rail output (C-14); calibrate on one real decline (D-03); real-versus-simulated table in 02; propose the API in 09 | [TEAM] |
| T&C breach if an agent handles card details | L/H | Any prompt, log or file touches PAN or CVV; the T&C bars disclosing security details [F2.secrecy] | A human types the card in tests; no code path sees PAN or CVV (I8); planner holds no credential (I4); docs-check flags digit runs; the account holder runs the test, since HKT may stop payments it suspects come from someone else [F2.suspicion] | [TEAM] |
| ToS on probes and Scameter | M/M | No terms cover automated or software use and the Important Notice limits reproduction [F6]; a store blocks the probe | Scameter by manual, human-paced captures only (D-07): no Bulk Search, redacted, nothing republished, ask HKPF before any live lookup; probes read-only with no bypass of bot challenges, each store's terms read first | [TEAM] |
| Minors optics | L/M | Pitch or UI reads as aimed at children [F2.plus2] | Adult Gen Z default [F24]; teen chain is an extension and the first cut (D9); no minor's data; minors are not in the headline | [TEAM] |
| Demo failure | M/H | Network, judge, planner or rail bug in a rehearsal | Fallbacks in 06; planner and judge replay from fixtures; backup video labelled recorded (D-18); four rehearsals [F41] | [TEAM] |
| Sleep | H/M | A person works past their slot; a gate is missed | Rota with one person off 4 h at a time [F41]; hand-off lines in TASKS.md; no sleep across a gate; cut by D9 before cutting sleep | [TEAM] |
| Scope creep | H/H | Work outside TASKS.md; a gate is missed | Scope locked (X-09); statement out-of-scope list (rewards, multi-merchant comparison, agent-to-agent negotiation); cut order D9 | [TEAM] |
| Merchant pre-auth above the limit causes false declines | M/M | The real test or a store declines although the total is within the limit [F2.preauth] | Record the decline code (D-03); add a `preauth` merchant stub mode (A-22) and report the false-block rate as MEASURED(n); say it under "where it breaks"; ask for a `preauth_tolerance` field in 09 | [TEAM] |
| Planner latency | M/M | Planner call passes its timeout [F33] in a rehearsal | Timeout means no cart and no mint (I5); the decision latency budget excludes the planner [F35]; demo replays a recorded planner output | [TEAM] |
| SIMULATED shown as real (label drift) | M/H | Any rail output, number or slide without a SIMULATED or provenance chip | Chip on every number (04); label audit (C-14); docs-check; honesty slide in 07 | [TEAM] |
| Pitch slot shorter than assumed | M/M | Organisers confirm under about 5 min [F14] | The 60 s pitch stands alone [F42]; trim the run-of-show per 07; ask in D-01 | [TEAM] |
| Unobserved numbers (E5) | M/H | A doc shows a rate, fee or limit without a register ID or capture | docs-check on unknown F-IDs; re-capture F1-F3 (D-06) or leave READ-BY-CLAUDE and say so; no vendor figure reported as ours | [TEAM] |

## Contingency (D8)
If the end-to-end stop still fails at H10 [F41], after the H6 cut, switch to Track 4, "overnight desk that escalates" (Jev-native), the second-ranked option [F43]. All lane owners decide together at H10; there is no half-switch. Not planned further here.
