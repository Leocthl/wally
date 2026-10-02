# data/evidence

- **What**: the human-captured evidence the Evidence screen shows next to the harness results: the manual-route stopwatch (E3) and the OBSERVED captures, including the one real decline (E5).
- **Read only by the app**: bundled at build time (`@evidence-data` alias in `apps/web/vite.config.ts`). Rebuild after an edit.
- **Templates ship empty**: `"status": "pending"` and no rows. The screen then says "pending: not captured yet" and shows no figure. Never type a placeholder value; leave a field `null` until it is measured or seen.
- **Raw files stay out of the repo**: recordings and screenshots go in `data/raw/` (gitignored). Only a redacted copy may enter `data/captures/` (docs/05 Capture protocol). No PAN, CVV, expiry, personal data or seller identity anywhere (I8).

## manual-route.json (schema `laisee.evidence.manual-route/v1`)
| Field | Meaning |
|---|---|
| `status` | `pending`, `partial` or `complete`; the screen also checks the runs against the sample rule [F80] |
| `routes[].id` | `M` by hand, `A` the agent flow (docs/05 Manual-route comparison) |
| `routes[].runs[]` | one object per timed run, fields below |
| `id` | run id, e.g. `M-01` |
| `runner` | initials only |
| `at_utc8` | start time, ISO 8601 with `+08:00` |
| `tag` | `OBSERVED` for a timed human run, `SIMULATED` for anything replayed |
| `steps` | taps, clicks and typed fields, counted from the recording |
| `decide_s`, `issue_s` | seconds, timed apart: opened link to decision, then decision to card ready |
| `issue_tag` | `SIMULATED` on route A (the issue step runs on the SIMULATED rail), else `OBSERVED` |
| `payment_completed` | must be `false`: no timed run completes a payment |
| `note` | optional, plain words |

- **Summary**: the screen prints median and range over OBSERVED runs as MEASURED(n), and marks any figure that includes a SIMULATED step as SIMULATED.

## captures.json (schema `laisee.evidence.captures/v1`)
| Field | Meaning |
|---|---|
| `captures[]` | one object per capture-sheet row that is now OBSERVED (`data/capture-sheet.md`) |
| `id`, `register_row` | capture id (`C01`) and register ID (`F1`) |
| `what` | what the page shows, in plain words |
| `value_seen` | the value exactly as shown on the page |
| `captured_at_utc8`, `captured_by` | time and initials |
| `redacted_file` | path under `data/captures/`, or `null` |
| `real_decline` | `null` until the real-card test (`data/real-card-test.md`) gives a decline; then `captured_at_utc8`, `decline_code`, `message`, `where`, `seconds_to_decline` (MEASURED, one sample), `merchant` (store id from the probe sheet, no seller identity), `redacted_file` |

## Who fills it
- **Lane D** after each timed run or capture, in the same commit as the capture-sheet row; the register row is promoted in that commit too (docs/05 Capture protocol).
