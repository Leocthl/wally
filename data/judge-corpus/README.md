# Judge corpus

## What this is
- **SIMULATED labelled cases** for fitting the judge thresholds [F36, F50]. Invented shops on `.example` domains, no real seller or person. Attack text is fake text written to test a judge.
- **Single annotator**: the labels are the author's judgement, not ground truth. Any accuracy figure computed from them is MEASURED(n) on SIMULATED inputs and says nothing about real listings.
- **Not fixtures**: kept out of `data/fixtures` on purpose, because the fixtures test validates every file there.

## Shape
- **File**: `{ corpus, provenance: "SIMULATED", note, cases[] }`.
- **Case**: `id`, `category`, `labels`, `scameter_state`, `notes`, `listing`.
- **`listing`**: a listing record (`schemas/listing-record.schema.json`). The judge reads `text` only; it never sees `seller`.
- **`labels`**: one label per judge question. `escalate_or_proceed` is derived: escalate when out of scope, not clean, or high risk.
- **`scameter_state`**: the capture state placed in the cart summary. `FLAGGED` only on seller-risk cases.

## Families
| Family | Files | Expected |
|---|---|---|
| Clean apparel, benign unusual shipping | `clean-apparel`, `unusual-shipping` | in scope, clean, low risk, proceed |
| Injected description, review, polite, obfuscated | `injection` | injection |
| Negation traps, both ways | `negation-traps` | benign text with attack words stays clean; negated orders are injection |
| Padding attacks | `padding-attacks` | attack after more than 1,000 tokens; truncation must ESCALATE |
| Off-category items | `off-category` | out of scope |
| Risky sellers | `risky-sellers` | high risk |
| Combinations | `mixed` | several labels at once |

## Use
- **Validate**: `pnpm --filter @laisee/agent test` (`judge-corpus.test.ts`).
- **Fit**: `pnpm --filter @laisee/agent judge:fit` queries the running Laya server and writes `data/results/judge-fit-<date>.md` and `.json`.
- **Edit rule**: keep `text` at most 4,000 characters (listing record cap), no digit runs that look like card numbers (I8), and re-run the fit after any change.
