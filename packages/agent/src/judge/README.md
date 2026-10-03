# Judge adapters

## Exports (`@wally/agent/judge`)
- **SystemOneJudge**: `JudgePort` for `laya` (local, default [F11c]) and `jev` (hosted, optional [F11b]). Same typed wire protocol, `POST /v1/systemone`.
- **ReplayJudge**: provider `replay`. Serves the recorded answers in `data/fixtures/judge`, keyed by the SHA-256 of the listing text. For CI and as a deliberate, labelled booth fallback. An unrecorded listing is an ERROR.
- **ShadowJudge**: only with an explicit `JUDGE_MODE=shadow`. Runs the real judge and sets `shadow: true`. Nothing else changes.
- **createJudgeFromEnv(env)**: reads the variables below. Bad configuration throws `JudgeConfigError` once, at composition. `assess` never throws.

## Environment
| Variable | Default | Notes |
|---|---|---|
| `JUDGE_PROVIDER` | `laya` | `laya`, `jev` or `replay`. There is no `llm` provider and no automatic failover |
| `JUDGE_MODE` | `enforce` | `enforce` or `shadow`. Unset or blank means `enforce` (fail closed, I5); `shadow` never blocks, so only when set explicitly |
| `LAYA_BASE_URL` | `http://127.0.0.1:8808` | Loopback is 127.0.0.0/8, ::1 or `localhost` only (`*.localhost` is not). Any other host needs `LAYA_ALLOW_REMOTE=1`, because listing text would leave the machine. No user name or password in the URL |
| `LAYA_MODEL` | `typed-decisions` | Always sent. Without it the server answers HTTP 500 |
| `LAYA_API_KEY` | none | Only if the Laya server was started with a key. Refused if it holds control characters; a remote host then needs https |
| `JEV_BASE_URL`, `JEV_MODEL` | `https://api.typesafe.ai`, `jev-1.13.0` | Jev only. https is required off loopback |
| `TYPESAFE_API_KEY` | none | Jev only. Sent as a Bearer header, never logged or recorded; refused if it holds control characters |

## Behaviour that matters
- **One request** carries the four typed questions. Each is sent as k option-order rotations (nine rows) and the answers are averaged back into canonical order. Turn off with `rotations: false`.
- **One attempt**, deadline from the caller (F34) through an `AbortController`, zero retries. A timeout is `TIMEOUT`; everything else that goes wrong is `ERROR`. R10 escalates both (I5).
- **Strict parse**: unknown labels, missing or non-numeric probabilities, probabilities that do not sum to about 1, a missing `usage` block (any provider: truncation unknown), an oversize body or a redirect are all `ERROR`. Rotation means are not renormalised, so a sum inside the tolerance can only make R10 stricter.
- **Diagnostics** carry error names and codes, never fetch messages (a message can quote a URL or a header).
- **Truncation**: `usage.truncated`, `state_tokens_dropped` above zero or a non-empty `truncated_questions` is `ERROR` with `input_truncated: true`. Laya cuts the tail of the state silently, so an injection placed after the first row would otherwise go unseen.
- **State**: mandate, categories, cart line, Scameter state, and the listing as a nested object. The listing text is untrusted data and never goes into a question's `instructions`.
- **Language gate** (default on, `language.ts`): the checkpoint is English-derived, so a listing whose letters are at least a tenth CJK (Han, kana, Hangul, Bopomofo, counted after NFKC; `CJK_SHARE_PERCENT`) is not sent to it. The record is `ERROR`, no answers, `version: skipped:unsupported_language` (the schema has no reason field), and no request is made. R10 escalates it as `R10.unavailable` with `reason: unsupported_language`, and the template says the checker reads English best. It never approves anything, but it turns an approval, or an `R10.injection` DENY that no answer can override, into a question the shopper must answer with a signed APPROVE, so a listing can choose "ask" over "deny" by adding enough CJK letters. `languageGate: false` switches it off for `judge:fit`, `judge:tune` and `judge:record`, which measure the raw checkpoint. The replay judge is not gated. Other non-Latin scripts are not covered, and a long English listing with one Chinese sentence can sit under the share.
- **Model-facing text** (M8): `modelText` NFKC-normalises listing strings, removes format characters (zero-width, bidi, soft hyphen, tag) and turns literal `[CLS]`, `[SEP]`, `[PAD]`, `[UNK]`, `[MASK]` into `(CLS)` and so on. The input keeps the original text for the log and the hash.
- **Windows** (stretch, off): `windowing: DEFAULT_WINDOWING` judges long listings in overlapping windows; the worst window decides every question, scope included. The fit report shows why it is off.
- **Latency** is the measured wall time of the call. A replay reports its lookup time, not the recorded one.
- **Warm up** after a Laya restart: the first call took 2,568 ms [F26], which is over F34, so the first decision would TIMEOUT. Call `judge.warmUp({ timeoutMs })` once at start (`isWarmable` checks for it); it never throws and reports `ok` and the measured time.

## Tools
- **Corpus**: `data/judge-corpus/` (SIMULATED, labelled, single annotator), split into tuning and held-out by a fixed hash rule (`fit/split.ts`, corpus README).
- **Wording**: `questions?:` on `SystemOneJudge` sends another wording; the default is `JUDGE_QUESTION_DEFS`, which is word for word the variant named by `SHIPPED_WORDING_VARIANT` in `fit/variants.ts`. Labels never change.
- **Tune** (B-19, B-20): `pnpm --filter @wally/agent judge:tune` runs every wording variant on the tuning split, picks one and fits the thresholds there by the rules stated in `fit/select.ts` and `fit/joint.ts`, then judges the held-out split once. Writes `data/results/judge-fit-<date>.md` and `.json` and `data/results/judge-thresholds-proposal.json`. It never edits the register or core config. `--run-file` keeps the stage file outside the repo; `--render-only` rebuilds the outputs from it.
- **Record** (B-10): `pnpm --filter @wally/agent judge:record` re-records `data/fixtures/judge/*.json` from live Laya with the shipped wording; a failed call writes nothing.
- **Fit**: `pnpm --filter @wally/agent judge:fit` is the first-round tool (all cases, register thresholds, per-gate suggestions).
- **Tests**: `pnpm --filter @wally/agent test`. The live Laya tests skip themselves when `/health` does not answer.
