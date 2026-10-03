# Qwen planner service

- **What**: a local llama.cpp `llama-server` running Qwen3.5 (GGUF, Q4_K_M) on this Mac. Wally uses it for three jobs only: the `local` planner (natural-language requests in English, Chinese or Cantonese become one proposed cart), the Seal screen's sentence-to-rules compiler (suggested rule chips the shopper edits and confirms), and the photo reader (the 9B model with its vision projector turns a picture into a few typed attributes; `packages/agent/src/vision`).
- **Never a judge, never a gate**: rules R1-R12, the rail limit and Laya's judge decide. The answer is untrusted input; code re-checks every field and fails closed. `rule` and `replay` stay the fallbacks. A picture is read into enum values only (no free text, no price, no brand); text printed in the picture is data.
- **Pictures stay here**: they arrive as base64 in the request, are decoded in memory and are never written to disk by Wally; the server log holds token counts and timings, not image data.
- **Credit**: Qwen3.5 by the Qwen team (Alibaba Cloud), Apache-2.0, https://huggingface.co/Qwen/Qwen3.5-9B and https://huggingface.co/Qwen/Qwen3.5-4B; GGUF quants by bartowski (Qwen publishes no GGUF for Qwen3.5); llama.cpp, MIT. Rows in `THIRD_PARTY.md`.
- **Binds to localhost only**: `127.0.0.1:8809` (Laya keeps 8808). `serve.sh` hard-codes the host, CORS reflects localhost origins only, no web UI, no `/slots`.
- **No auth**: any local process can call it. Do not expose the port.

## Run it
- **Setup** (once, needs internet, huggingface.co only): `./setup.sh`
  - checks that the Homebrew `llama-server` is build 9222 or newer (the GGUF files need it); otherwise run `brew upgrade llama.cpp`
  - downloads exactly three files (about 10.1 GB: the two models and the 9B model's vision projector `mmproj-Qwen_Qwen3.5-9B-f16.gguf`), verifies the SHA-256 against the Hub metadata of the pinned commit, writes `MODEL_REVISION` and `MODEL_SHA256` on the first run and enforces them afterwards
  - `QWEN_MODELS=9b 9b-vision ./setup.sh` fetches those two only; safe to re-run; `QWEN_CACHE_DIR` puts the files elsewhere
- **Serve**: `./serve.sh` (default 9b), `QWEN_MODEL=4b ./serve.sh` for the smaller one
  - checks the weights and the projector against `MODEL_SHA256` first (`QWEN_SKIP_VERIFY=1` skips it), then starts detached and waits for `GET /health`
  - flags: `--offline --mmproj <projector> --image-max-tokens 512` (`QWEN_VISION=off` serves text only with `--no-mmproj`; the 4B model has no projector pinned; `QWEN_IMAGE_MAX_TOKENS` changes the picture budget), context `CONTEXT_TOKENS=8192` shared by 2 slots, all layers on Metal, flash attention on, thinking off (`--reasoning off`), temperature 0, seed 42, MTP speculative decoding (`QWEN_SPEC=off` disables it; it runs fine together with vision)
  - writes `qwen-serve.pid`, appends to `qwen-serve.log` (both gitignored)
- **Stop**: `./stop.sh` (kills only the PID in `qwen-serve.pid`, or with no pid file the listener on port 8809, and only if it is our llama-server on port 8809)
- **Smoke**: `node smoke.mjs` (Node 22+, no packages): health, three grammar-constrained answers (one Cantonese), one generated plain-colour picture when the server reads pictures, latency and tokens per second with the load average; `--runs`, `--warmup`, `--json-out`
- **Remove everything**: `./stop.sh; rm -rf .cache qwen-serve.log`

## Use from the app
- **Planner**: `PLANNER_PROVIDER=local`, `PLANNER_BASE_URL` (default `http://127.0.0.1:8809`), `PLANNER_MODEL` (`qwen3.5-9b-q4km` or `qwen3.5-4b-q4km`), `PLANNER_ALLOW_REMOTE=1` only for a non-loopback host
- **Compiler**: `compileMandateText` from `@wally/agent/compiler`, with `createChatClient` from `@wally/agent/planner`; `{ ok: false }` means fall back to the rule-based compile
- **Photo reader**: `describeImage` from `@wally/agent/vision`, with the same chat client; `null` attributes mean fall back to the colour palette and the item-type chips. The booth server asks `/props` once at start (`modalities.vision`) and reports `features.see` accordingly
- **Request shape**: OpenAI `POST /v1/chat/completions`, `temperature 0`, `seed`, `chat_template_kwargs.enable_thinking=false`, `response_format: json_schema` (llama-server turns it into a grammar)

## Files
- `setup.sh`, `fetch_model.mjs`: install check and verified download
- `serve.sh`, `stop.sh`: start and stop (`serve.sh` also reads `QWEN_CACHE_DIR`, so a git worktree can share the main checkout's `.cache`)
- `smoke.mjs`: smoke and latency
- `MODEL_REVISION`, `MODEL_SHA256`: pins, committed on purpose
- measured numbers and the model choice: `data/results/qwen-planner-2026-10-02.md` (findings file to follow from the m-qwen lane report)
- gitignored: `.cache/`, `qwen-serve.pid`, `qwen-serve.log`
