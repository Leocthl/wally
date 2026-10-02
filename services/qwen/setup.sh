#!/usr/bin/env bash
# Idempotent setup for the local Qwen service (Wally's planner and sentence-to-rules compiler).
#
#   1. llama.cpp: checks that the Homebrew llama-server is new enough to load Qwen3.5 GGUF files.
#   2. weights:   ONLY the pinned GGUF files (no vision projector), verified against the Hub's SHA-256,
#                 pins written to MODEL_REVISION and MODEL_SHA256 on the first run, enforced afterwards.
#
#   ./setup.sh                 both models (9b and 4b), about 9.2 GB
#   QWEN_MODELS=9b ./setup.sh  only one
#
# This is the only step that touches the network (huggingface.co). Everything lands in .cache (gitignored).
# Uninstall: ./stop.sh; rm -rf .cache qwen-serve.log
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

# bartowski quantised these files with llama.cpp b9222 (qwen35 architecture plus MTP tensors); older builds fail.
MIN_LLAMA_BUILD=9222

die() { echo "ERROR: $*" >&2; exit 1; }

command -v llama-server >/dev/null 2>&1 || die "llama-server not found; install it with: brew install llama.cpp"
command -v node >/dev/null 2>&1 || die "node not found (Node 22 or newer)"
command -v curl >/dev/null 2>&1 || die "curl not found"

echo "==> 1/2 llama.cpp"
version_line="$(llama-server --version 2>&1 | grep -m1 'version' || true)"
build="$(printf '%s' "$version_line" | sed -n 's/.*build \([0-9][0-9]*\).*/\1/p')"
[ -n "$build" ] || die "cannot read the llama-server build number from: $version_line"
if [ "$build" -lt "$MIN_LLAMA_BUILD" ]; then
  die "llama-server build $build is older than b$MIN_LLAMA_BUILD and cannot load Qwen3.5; run: brew upgrade llama.cpp"
fi
echo "$version_line (build $build >= b$MIN_LLAMA_BUILD)"

echo "==> 2/2 weights (${QWEN_MODELS:-9b 4b})"
unset HF_TOKEN HUGGING_FACE_HUB_TOKEN HF_ENDPOINT
# shellcheck disable=SC2086 # word splitting of the key list is intended
node fetch_model.mjs ${QWEN_MODELS:-9b 4b}

echo
du -sh .cache 2>/dev/null || true
cat MODEL_REVISION
cat MODEL_SHA256
echo "next: ./serve.sh   then: node smoke.mjs"
