# Judge corpus

## What this is
- **SIMULATED labelled cases** for fitting and checking the judge thresholds [F36, F50]. Invented shops on `.example` domains, no real seller or person. Attack text is fake text written to test a judge.
- **Single annotator**: the labels are the author's judgement, not ground truth. Any accuracy figure computed from them is MEASURED(n) on SIMULATED inputs and says nothing about real listings.
- **Not fixtures**: kept out of `data/fixtures` on purpose, because the fixtures test validates every file there.

## Shape
- **File**: `{ corpus, provenance: "SIMULATED", note, cases[] }`.
- **Case**: `id`, `category`, `labels`, `scameter_state`, `notes`, optional `group`, `listing`.
- **`listing`**: a listing record (`schemas/listing-record.schema.json`). The judge reads `text` only; it never sees `seller`.
- **`labels`**: one label per judge question. `escalate_or_proceed` is derived: escalate when out of scope, not clean, or high risk.
- **`scameter_state`**: the capture state placed in the cart summary. `FLAGGED` only on seller-risk cases.
- **`group`**: cases that share text (the five first-round padding cases share one filler) share a group and stay in one split.

## Families
| Family | Files | Expected |
|---|---|---|
| Clean apparel, benign unusual shipping | `clean-apparel*`, `unusual-shipping` | in scope, clean, low risk, proceed |
| Human-directed imperatives | `legit-imperatives` | proceed ("Please wash cold", "DM us for size help") |
| Scam-awareness lines | `scam-awareness` | proceed (a shop warning about scams is low risk) |
| Shipping and returns policy text | `shipping-returns`, `legit-more` | proceed |
| Reviews that quote instructions to people | `review-quotes` | proceed |
| zh-HK and mixed-language legitimate | `zh-hk-legit`, `legit-more` | proceed (measured, not fixed: the checkpoint is English-derived) |
| Injected description, review, polite, obfuscated | `injection` | injection |
| Negation traps, both ways | `negation-traps`, `negation-benign-more` | benign text with attack words stays clean; negated orders are injection |
| Padding | `padding-attacks*`, `padding-benign-more` | attack or long honest text past the 1,024-token row; truncation must ESCALATE |
| Off-category items | `off-category*`, `stop-more` | out of scope |
| Risky sellers | `risky-sellers*`, `stop-more` | high risk |
| Combinations | `mixed` | several labels at once |

- **Injection text**: the held-out round added no new injection text; the injected cases are the first-round ones, split between tuning and held-out.

## Split (fixed before any tuning)
- **Rule** (`packages/agent/src/judge/fit/split.ts`): the unit is `group` or the case id; within each family, units sorted by SHA-256 of `laisee-judge-split-v1:<unit>`; even positions go to tuning, odd to held-out.
- **Checks** (`judge-split.test.ts`): every family is in both splits; no pair across the split shares 0.4 or more of its word 3-shingles (Han characters count one each).
- **Adding cases redraws the split**: a later addition needs a fresh held-out round, reported as such.

## Use
- **Validate**: `pnpm --filter @laisee/agent test` (`judge-corpus.test.ts`, `judge-split.test.ts`).
- **Tune and evaluate**: `pnpm --filter @laisee/agent judge:tune` runs every wording variant on the tuning split, fits the thresholds there, then judges the held-out split once; it writes `data/results/judge-fit-<date>.md` and `.json` and `data/results/judge-thresholds-proposal.json`.
- **Edit rule**: keep `text` at most 4,000 characters (listing record cap), no digit runs that look like card numbers (I8), and re-run after any change.
