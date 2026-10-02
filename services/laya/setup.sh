#!/usr/bin/env bash
# Idempotent setup for the local Laya judge service (typed-decisions checkpoint only).
#
#   1. .venv  : uv venv (Python 3.13) + `laya[serve]==0.3.23` from PyPI, wheels only.
#   2. weights: ONLY the five typed-decisions/ files of convaiinnovations/laya (~846 MB),
#               verified against Hugging Face metadata, hash pinned in MODEL_SHA256.
#
# Everything lands under this directory (.venv, .cache). To uninstall: rm -rf .venv .cache
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

LAYA_SPEC="laya[serve]==0.3.23"
LAYA_VERSION="0.3.23"

# Keep every download inside this directory and never reuse the user's HF token or cache.
export UV_CACHE_DIR="$HERE/.cache/uv"
export UV_PYTHON_DOWNLOADS=never          # never fetch a managed Python
export HF_HOME="$HERE/.cache/hf-home"     # tokens, xet chunk cache
export HF_HUB_CACHE="$HERE/.cache/hf"     # model snapshots
export HF_HUB_DISABLE_TELEMETRY=1
export HF_HUB_DISABLE_IMPLICIT_TOKEN=1
export HF_HUB_OFFLINE=0                   # this is the only step allowed to touch the network
export DO_NOT_TRACK=1
unset HF_TOKEN HUGGING_FACE_HUB_TOKEN HF_ENDPOINT

command -v uv >/dev/null 2>&1 || { echo "ERROR: uv not found on PATH (https://docs.astral.sh/uv/)" >&2; exit 1; }
mkdir -p "$HERE/.cache"

echo "==> 1/3 virtualenv"
if [ ! -x .venv/bin/python ]; then
  uv venv --python 3.13 .venv
else
  echo ".venv already exists"
fi

echo "==> 2/3 laya ${LAYA_VERSION} (wheels only)"
installed="$(.venv/bin/python -I -c 'import importlib.metadata as m; print(m.version("laya"))' 2>/dev/null || true)"
if [ "$installed" = "$LAYA_VERSION" ]; then
  echo "laya ${installed} already installed"
else
  uv pip install --python .venv/bin/python --only-binary :all: "$LAYA_SPEC"
fi

echo "==> 3/3 typed-decisions checkpoint (five files, ~846 MB)"
.venv/bin/python -I fetch_model.py

echo
echo "==> installed"
.venv/bin/python -I - <<'PY'
import importlib.metadata as m
import torch
for name in ("laya", "torch", "transformers", "safetensors", "huggingface_hub", "numpy", "fastapi", "uvicorn"):
    print(f"{name:16} {m.version(name)}")
print(f"{'mps available':16} {torch.backends.mps.is_available()}")
PY
echo
du -sh .venv .cache 2>/dev/null
echo "model sha256: $(cut -d' ' -f1 MODEL_SHA256)"
echo "model commit: $(cat MODEL_REVISION)"
echo "next: ./serve.sh   then: node smoke.mjs"
