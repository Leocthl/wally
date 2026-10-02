# Judge adapters

## Exports (`@laisee/agent/judge`)
- **SystemOneJudge**: `JudgePort` for `laya` (local, default [F11c]) and `jev` (hosted, optional [F11b]). Same typed wire protocol, `POST /v1/systemone`.
- **ReplayJudge**: provider `replay`. Serves the recorded answers in `data/fixtures/judge`, keyed by the SHA-256 of the listing text. For CI and as a deliberate, labelled booth fallback. An unrecorded listing is an ERROR.
- **ShadowJudge**: `JUDGE_MODE=shadow`. Runs the real judge and sets `shadow: true`. Nothing else changes.
- **createJudgeFromEnv(env)**: reads the variables below. Bad configuration throws `JudgeConfigError` once, at composition. `assess` never throws.

## Environment
| Variable | Default | Notes |
|---|---|---|
| `JUDGE_PROVIDER` | `laya` | `laya`, `jev` or `replay`. There is no `llm` provider and no automatic failover |
| `JUDGE_MODE` | `shadow` | `shadow` or `enforce` (the demo runs `enforce`) |
| `LAYA_BASE_URL` | `http://127.0.0.1:8808` | A non-loopback host needs `LAYA_ALLOW_REMOTE=1`, because listing text would leave the machine |
| `LAYA_MODEL` | `typed-decisions` | Always sent. Without it the server answers HTTP 500 |
| `LAYA_API_KEY` | none | Only if the Laya server was started with a key |
| `JEV_BASE_URL`, `JEV_MODEL` | `https://api.typesafe.ai`, `jev-1.13.0` | Jev only. https is required off loopback |
| `TYPESAFE_API_KEY` | none | Jev only. Sent as a Bearer header, never logged or recorded |

## Behaviour that matters
- **One request** carries the four typed questions. Each is sent as k option-order rotations (nine rows) and the answers are averaged back into canonical order. Turn off with `rotations: false`.
- **One attempt**, deadline from the caller (F34) through an `AbortController`, zero retries. A timeout is `TIMEOUT`; everything else that goes wrong is `ERROR`. R10 escalates both (I5).
- **Strict parse**: unknown labels, missing or non-numeric probabilities, probabilities that do not sum to about 1, a missing `usage` block, an oversize body or a redirect are all `ERROR`.
- **Truncation**: `usage.truncated`, `state_tokens_dropped` above zero or a non-empty `truncated_questions` is `ERROR` with `input_truncated: true`. Laya cuts the tail of the state silently, so an injection placed after the first row would otherwise go unseen.
- **State**: mandate, categories, cart line, Scameter state, and the listing as a nested object. The listing text is untrusted data and never goes into a question's `instructions`.
- **Windows** (stretch, off): `windowing: DEFAULT_WINDOWING` judges long listings in overlapping windows. The fit report shows why it is off.
- **Latency** is the measured wall time of the call. A replay reports its lookup time, not the recorded one.
- **Warm up** after a Laya restart: the first call took 2,568 ms [F26], which is over F34, so the first decision would TIMEOUT. Call `judge.warmUp({ timeoutMs })` once at start (`isWarmable` checks for it); it never throws and reports `ok` and the measured time.

## Tools
- **Corpus**: `data/judge-corpus/` (SIMULATED, labelled, single annotator).
- **Fit**: `pnpm --filter @laisee/agent judge:fit` queries the running Laya server and writes `data/results/judge-fit-<date>.md` and `.json`. Every figure is MEASURED(n) on SIMULATED inputs.
- **Tests**: `pnpm --filter @laisee/agent test`. The live Laya tests skip themselves when `/health` does not answer.
