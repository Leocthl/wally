# Laya judge service

- **What**: a local HTTP service that answers typed multiple-choice questions about a piece of text in one forward pass, no LLM tokens. Wally uses it as a fast "System 1" judge for scope fit, injection risk, seller risk and escalate-or-proceed.
- **Credit**: Laya by Convai Innovations, Apache-2.0, https://github.com/NandhaKishorM/laya, weights https://huggingface.co/convaiinnovations/laya
- **Version**: PyPI `laya[serve]==0.3.23`, wheels only, run through its own `laya-serve` (Jev-compatible `POST /v1/systemone`).
- **Checkpoint**: `typed-decisions` only (subfolder of `convaiinnovations/laya`, about 421M parameters, 842.6 MB of weights). The `laya` and `multilingual` checkpoints are not downloaded and cannot be loaded offline.
- **Binds to localhost only**: `127.0.0.1:8808`. `serve.sh` hard-codes the host; `laya-serve` itself defaults to `0.0.0.0`, so never start it by hand without `LAYA_HOST=127.0.0.1`.
- **No auth**: any local process can call it. Do not expose the port.

## Run it

- **Setup** (once, needs internet): `./setup.sh`
  - creates `.venv` with `uv venv --python 3.13`, installs `laya[serve]==0.3.23` with `--only-binary :all:`
  - downloads only the five `typed-decisions/` files (about 846 MB), checks sizes and hashes against Hugging Face metadata
  - writes `MODEL_SHA256` and `MODEL_REVISION` on the first run and enforces them on every later run
  - safe to re-run; it skips what is already installed
- **Serve**: `./serve.sh`
  - starts `.venv/bin/laya-serve` detached, writes `laya-serve.pid` and appends to `laya-serve.log`
  - waits until `GET /health` answers (about 10 s on this machine)
  - device is `mps` when torch reports it, else `cpu`; override with `LAYA_DEVICE=cpu ./serve.sh`
  - runs offline (`HF_HUB_OFFLINE=1`); no network access is needed after setup
- **Stop**: `./stop.sh` (kills only the PID in `laya-serve.pid`, and only if it still looks like `laya-serve`)
- **Smoke test**: `node smoke.mjs` (Node 22 or newer, global `fetch`, no npm packages)
  - 8 simulated states x 4 judge questions, printed as probabilities
  - latency: 5 warm-up then 30 timed requests, p50 and p95, wall-clock and server-side
  - `option_order` rotation test
  - `--probes` adds adapter-quirk probes (one deliberate HTTP 500), `--json-out run.json` saves everything, `--skip-latency` and `--skip-rotation` shorten it
- **Health**: `curl -s http://127.0.0.1:8808/health` shows loaded checkpoint, commit, and the device it really computes on
- **Remove everything**: `./stop.sh; rm -rf .venv .cache laya-serve.log`

## Request shape

- **Endpoint**: `POST http://127.0.0.1:8808/v1/systemone`, JSON body `{ "model": "typed-decisions", "state": <any JSON>, "questions": { <id>: { "type": "choice", "instructions": str, "criteria": { <label>: <description> } } } }`
- **Always send** `"model": "typed-decisions"`. Without it the router picks the English checkpoint, which is not installed, and the request fails with HTTP 500.
- **Questions**: the four used by the smoke test live in `fixtures/questions.json`; the simulated states are in `fixtures/states.json`
- **Batch**: `POST /v1/systemone/batch` takes `states` (at most 64) plus one `questions` map
- **Details and measured numbers**: see `FINDINGS.md`

## Environment variables

- **Set by `serve.sh`** (do not set these by hand):
  - `LAYA_HOST=127.0.0.1`, `LAYA_PORT=8808`
  - `LAYA_MODELS=typed-decisions`, `LAYA_PRELOAD=1`, `LAYA_AUTO_TASK=0`
  - `LAYA_REVISION=<MODEL_REVISION>`: load exactly the downloaded commit
  - `LAYA_SHA256_DIGESTS`: laya hashes `model.safetensors` against `MODEL_SHA256` before parsing it and refuses to load on a mismatch
  - `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_CACHE=.cache/hf`, `HF_HOME=.cache/hf-home`
  - `HF_HUB_DISABLE_TELEMETRY=1`, `HF_HUB_DISABLE_IMPLICIT_TOKEN=1`, `DO_NOT_TRACK=1`; any `HF_TOKEN` is unset
- **You may override** when calling `serve.sh`:
  - `LAYA_DEVICE`: `mps` or `cpu`
  - `LAYA_THREADS`: torch CPU threads, clamped to the physical core count (15 on this machine)
- **Port**: `8808` is fixed in `serve.sh`; change `PORT` there if it collides

## Files

- `setup.sh`, `fetch_model.py`: install and verified download
- `serve.sh`, `stop.sh`: start and stop
- `smoke.mjs`: smoke, latency and option-order test
- `fixtures/states.json`, `fixtures/questions.json`, `fixtures/probe_states_zh.json`: SIMULATED test data, no real shops, sellers or people
- `MODEL_SHA256`, `MODEL_REVISION`: pins for the weights, committed on purpose
- `FINDINGS.md`: measured numbers, security checks, response shape, adapter quirks
- gitignored: `.venv/`, `.cache/`, `laya-serve.pid`, `laya-serve.log`
