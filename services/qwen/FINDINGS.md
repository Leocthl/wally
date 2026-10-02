# Qwen service findings

Measured on the booth Mac (Apple M5 Pro, 48 GB) on 2026-10-02 and 03 by the m-qwen lane, with llama.cpp from Homebrew. Latencies depend heavily on machine load; re-measure on a quiet laptop before quoting any number.

## Model choice
- **Source**: Qwen publishes Qwen3.5 only as safetensors, so there is no official GGUF. The files are bartowski's quants (re-quantised with llama.cpp b9222 on 2026-05-19, imatrix, MTP head included). unsloth's quants date from release day.
- **Files** (exactly two, 9,182,369,792 bytes, no mmproj):
  - `Qwen_Qwen3.5-9B-Q4_K_M.gguf`, 6,169,341,984 bytes, repo `bartowski/Qwen_Qwen3.5-9B-GGUF` at 182be2fd6c7bc44887d88a91cb03ff009cc9f549, sha256 d784ce9eda1a5a7b51e8f705a9e6310844bf4f173654d115823c775fdea56d43.
  - `Qwen_Qwen3.5-4B-Q4_K_M.gguf`, 3,013,027,808 bytes, repo `bartowski/Qwen_Qwen3.5-4B-GGUF` at 4168f45a16a1290d65a4ec0fa312ae917a4c15d6, sha256 13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983.
- **Licence**: Apache-2.0 (base models Qwen/Qwen3.5-9B and Qwen/Qwen3.5-4B). Qwen3.5 has no separate instruct model: the post-trained model with thinking switched off is the instruct mode.
- **Pins**: hashes are checked against the Hub's LFS metadata and pinned in `MODEL_REVISION` and `MODEL_SHA256`; `serve.sh` re-checks the hash before every start.
- **Default**: the 9B (highest correct-item rate with every answer valid and p95 under F33). The 4B stays selectable with `QWEN_MODEL=4b`.

## Server behaviour
- **llama.cpp**: Homebrew 0.4.1 (build 10964) loads both files; no upgrade was needed.
- **Load time**: about 16 s from start to a healthy `/health`, plus about 3 s for the hash check.
- **Thinking off**: use `--reasoning off` (the `--chat-template-kwargs` form is deprecated) plus a per-request `enable_thinking: false`. No thinking text came back in any call.
- **Grammar**: llama-server honoured enum, const, anyOf, integer ranges and maxLength. All 50 answers in the final pass were valid.
- **Answer length**: the model pretty-printed its JSON (about 75 tokens) until the prompt asked for one compact line (about 50 tokens).
- **Context**: `--kv-unified` lets one request use all 8192 tokens; without it each of the 2 slots gets 4096.
- **MTP speculative decoding**: draft acceptance 0.45 to 0.56 (mean accepted length 2.4 to 2.7), lifting decode from about 9 to 12 tokens per second under load. The "unused tensor blk.32" warnings at start are the MTP layer. Turn it off with `QWEN_SPEC=off`.
- **Model field**: llama-server ignores the request's model name and answers with its alias.

## Speed and memory (load average 35 to 60 for llama-bench)
- 9B: reads prompts at 786 +/- 141 tokens per second, decodes at 11.7 +/- 4.2.
- 4B: reads at 1,064 +/- 425, decodes at 15.6 +/- 7.0. On CPU only the 4B decodes at 7.1 +/- 1.0.
- At load average 7.7 to 12.2 (final pass, n=25): 9B p50 1,735 ms and p95 2,593 ms, 34 decoded tokens per second at p50; 4B p50 1,073 ms and p95 1,928 ms, 54 tokens per second.
- At load average 50 to 75 with a game client open, the 9B decoded 3 to 12 tokens per second and a call took 6 to 9 s.
- Memory: the 9B's resident memory is 6.0 to 6.7 GB at start and 7.1 to 8.0 GB after the evaluation, which counts the 6.2 GB mapped weights file; its physical footprint is 2.6 to 5.2 GB. The 4B's resident memory is 3.9 GB and its footprint 1.2 GB.

## Security
- `lsof` shows only `127.0.0.1:8809` listening. The server starts with `--offline` and `--no-mmproj` and has no `-hf` flag, so it reads only the local file.
- The web UI and `/slots` are off, CORS reflects localhost origins only, and `serve.sh` clears all `LLAMA_ARG_*` variables and any key or token before starting.
- There is no authentication on 8809: any local process can call it.

## Not done
- An OS-level network-deny test.
- The hijack experiment with the 4B (only the 9B was measured: with listing text shown, 2 of 31 injected listings changed the proposal, both to "ask the shopper" or "give up"; the gift card was never added; none of 23 clean controls changed).
- Determinism with two overlapping requests on the 2 slots.

Evaluation numbers and caveats: `data/results/qwen-planner-2026-10-02.md`.
