#!/usr/bin/env bash
# Start the local Qwen server (llama.cpp llama-server) in the background, 127.0.0.1 only.
#
#   ./serve.sh                  the default model (9b; see FINDINGS.md for why)
#   QWEN_MODEL=4b ./serve.sh    the smaller, faster model
#   QWEN_SKIP_VERIFY=1 ./serve.sh   skip the SHA-256 check of the weights (saves a few seconds)
#   QWEN_SPEC=off ./serve.sh    no MTP speculative decoding (default on: the GGUF carries the MTP head)
#   QWEN_VISION=off ./serve.sh  no vision projector: the server reads text only (default on for the 9b model)
#   QWEN_CACHE_DIR=/path ./serve.sh   read the GGUF files from another folder (a git worktree shares the main checkout's)
#
# Runs offline (--offline, no -hf flag): it reads local GGUF files that setup.sh verified (the weights, and with vision
# on the 9b model's projector, whose hash is checked the same way). Pictures are decoded in memory and never stored.
# Thinking is off: Qwen3.5 thinks by default; --reasoning off makes the template close the think block, and
# the clients also send chat_template_kwargs.enable_thinking=false. CORS only reflects localhost origins.
# PID file: qwen-serve.pid   log: qwen-serve.log   (both gitignored). Stop with ./stop.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

HOST="127.0.0.1"          # fixed on purpose: never bind a wildcard address
PORT="8809"               # Laya uses 8808
CONTEXT_TOKENS=8192       # whole KV pool; one planner request is about 1,000 to 2,000 tokens
PARALLEL_SLOTS=2          # booth planner plus the compiler or the harness
GPU_LAYERS=999            # all layers on Metal
SEED=42                   # default seed; the clients also send their own
IMAGE_MAX_TOKENS="${QWEN_IMAGE_MAX_TOKENS:-512}"   # most tokens one picture may cost; 512 kept kind accuracy at 25/29 and ran about 2.3 s per picture (FINDINGS.md)
PID_FILE="$HERE/qwen-serve.pid"
LOG_FILE="$HERE/qwen-serve.log"
CACHE_DIR="${QWEN_CACHE_DIR:-$HERE/.cache}"
READY_TIMEOUT_S=300

die() { echo "ERROR: $*" >&2; exit 1; }

MODEL_KEY="${QWEN_MODEL:-9b}"
MMPROJ_FILE=""
case "$MODEL_KEY" in
  9b) MODEL_FILE="Qwen_Qwen3.5-9B-Q4_K_M.gguf"; ALIAS="qwen3.5-9b-q4km"; MMPROJ_FILE="mmproj-Qwen_Qwen3.5-9B-f16.gguf" ;;
  4b) MODEL_FILE="Qwen_Qwen3.5-4B-Q4_K_M.gguf"; ALIAS="qwen3.5-4b-q4km" ;;   # no projector is pinned for the 4b model
  *) die "QWEN_MODEL must be 9b or 4b, got '$MODEL_KEY'" ;;
esac
MODEL_PATH="$CACHE_DIR/$MODEL_FILE"

# Vision (the photo feature): on by default where a projector is pinned and present. A missing projector never stops
# the planner and the sentence reader from starting; it is said out loud and the server reads text only.
case "${QWEN_VISION:-on}" in
  on) VISION="on" ;;
  off) VISION="off" ;;
  *) die "QWEN_VISION must be on or off" ;;
esac
case "$IMAGE_MAX_TOKENS" in
  ''|*[!0-9]*) die "QWEN_IMAGE_MAX_TOKENS must be a whole number, got '$IMAGE_MAX_TOKENS'" ;;
esac
[ "$IMAGE_MAX_TOKENS" -ge 64 ] && [ "$IMAGE_MAX_TOKENS" -le 2048 ] || die "QWEN_IMAGE_MAX_TOKENS must be from 64 to 2048"
MMPROJ_PATH=""
if [ "$VISION" = "on" ]; then
  if [ -z "$MMPROJ_FILE" ]; then
    echo "vision: off (no projector is pinned for the $MODEL_KEY model)"
    VISION="off"
  elif [ ! -s "$CACHE_DIR/$MMPROJ_FILE" ]; then
    echo "vision: off ($CACHE_DIR/$MMPROJ_FILE is missing; run ./setup.sh to fetch it)" >&2
    VISION="off"
  else
    MMPROJ_PATH="$CACHE_DIR/$MMPROJ_FILE"
  fi
fi

case "${QWEN_SPEC:-mtp}" in
  mtp) SPEC_ARGS=(--spec-type draft-mtp) ;;
  off) SPEC_ARGS=() ;;
  *) die "QWEN_SPEC must be mtp or off" ;;
esac

command -v llama-server >/dev/null 2>&1 || die "llama-server not found; run ./setup.sh"
[ -s "$MODEL_PATH" ] || die "$MODEL_PATH missing; run ./setup.sh"
[ -s MODEL_SHA256 ] || die "MODEL_SHA256 missing; run ./setup.sh"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "already running, pid $(cat "$PID_FILE") (use ./stop.sh first to restart or switch model)"
  exit 0
fi
rm -f "$PID_FILE"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "port $PORT is already in use by another process"
fi

# --- integrity: the file must match the pinned SHA-256 -----------------------------------------------
verify_file() {   # verify_file <path> <file name>: the file must match its pin in MODEL_SHA256
  local path="$1" name="$2" pinned got
  pinned="$(awk -v f="$name" '$2 == f { print $1 }' MODEL_SHA256)"
  [ -n "$pinned" ] || die "no pin for $name in MODEL_SHA256; run ./setup.sh"
  [ "${QWEN_SKIP_VERIFY:-0}" != "1" ] || return 0
  if command -v openssl >/dev/null 2>&1; then
    got="$(openssl dgst -sha256 -r "$path" | cut -d' ' -f1)"
  else
    got="$(shasum -a 256 "$path" | cut -d' ' -f1)"
  fi
  [ "$got" = "$pinned" ] || die "$name sha256 $got != pinned $pinned; refusing to load it"
  echo "sha256 ok ($name)"
}
verify_file "$MODEL_PATH" "$MODEL_FILE"
[ -z "$MMPROJ_PATH" ] || verify_file "$MMPROJ_PATH" "$MMPROJ_FILE"

if [ -n "$MMPROJ_PATH" ]; then
  VISION_ARGS=(--mmproj "$MMPROJ_PATH" --image-max-tokens "$IMAGE_MAX_TOKENS")
else
  VISION_ARGS=(--no-mmproj)
fi

# --- environment: llama-server reads LLAMA_ARG_* variables; none may override the flags below ----------
for name in $(env | sed -n 's/^\(LLAMA_ARG_[A-Z_]*\)=.*/\1/p'); do unset "$name"; done
unset LLAMA_API_KEY HF_TOKEN HUGGING_FACE_HUB_TOKEN HF_ENDPOINT

{
  echo "=== $(date '+%Y-%m-%dT%H:%M:%S%z') start host=$HOST port=$PORT model=$MODEL_FILE ctx=$CONTEXT_TOKENS slots=$PARALLEL_SLOTS spec=${QWEN_SPEC:-mtp} vision=$VISION image_max_tokens=$IMAGE_MAX_TOKENS"
} >> "$LOG_FILE"

# perl setsid detaches the server from this shell's session, so closing the terminal that ran serve.sh does
# not kill it. exec keeps the PID, so $! is the server's PID.
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec failed: $!\n"' -- \
  llama-server \
    --model "$MODEL_PATH" \
    --alias "$ALIAS" \
    --host "$HOST" --port "$PORT" \
    --offline ${VISION_ARGS[@]+"${VISION_ARGS[@]}"} \
    --ctx-size "$CONTEXT_TOKENS" --parallel "$PARALLEL_SLOTS" --kv-unified \
    --n-gpu-layers "$GPU_LAYERS" --flash-attn on \
    --jinja --reasoning off --reasoning-budget 0 \
    --temp 0 --top-k 1 --seed "$SEED" \
    --no-webui --no-slots --cors-origins localhost --no-cors-credentials \
    ${SPEC_ARGS[@]+"${SPEC_ARGS[@]}"} \
  >> "$LOG_FILE" 2>&1 < /dev/null &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

echo "starting llama-server pid $SERVER_PID on http://$HOST:$PORT ($MODEL_FILE, vision $VISION)"
echo "waiting for the model to load (log: $LOG_FILE)"

deadline=$(( $(date +%s) + READY_TIMEOUT_S ))
while :; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "server exited during startup; last log lines:" >&2
    tail -n 30 "$LOG_FILE" >&2
    rm -f "$PID_FILE"
    exit 1
  fi
  if health="$(curl -fsS --max-time 2 "http://$HOST:$PORT/health" 2>/dev/null)"; then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "timed out after ${READY_TIMEOUT_S}s waiting for /health; last log lines:" >&2
    tail -n 30 "$LOG_FILE" >&2
    exit 1
  fi
  sleep 0.5
done

echo "ready: $health"
echo "pid $SERVER_PID, rss $(ps -o rss= -p "$SERVER_PID" | awk '{printf "%.0f MB", $1/1024}')"
echo "stop with: $HERE/stop.sh"
