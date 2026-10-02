#!/usr/bin/env bash
# Start the local Laya judge server (typed-decisions only) in the background, 127.0.0.1 only.
#
#   ./serve.sh                    device auto: mps if torch reports it, else cpu
#   LAYA_DEVICE=cpu ./serve.sh    force a device (mps or cpu)
#   LAYA_THREADS=5 ./serve.sh     torch intra-op threads (clamped to the physical core count)
#
# Runs offline (HF_HUB_OFFLINE=1) from the snapshot that setup.sh downloaded and verified.
# PID file: laya-serve.pid   log: laya-serve.log   (both gitignored). Stop with ./stop.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

HOST="127.0.0.1"   # fixed on purpose: laya-serve itself defaults to 0.0.0.0
PORT="8808"
PID_FILE="$HERE/laya-serve.pid"
LOG_FILE="$HERE/laya-serve.log"
READY_TIMEOUT_S=300

die() { echo "ERROR: $*" >&2; exit 1; }

[ -x .venv/bin/laya-serve ] || die ".venv/bin/laya-serve not found; run ./setup.sh first"
[ -s MODEL_SHA256 ] && [ -s MODEL_REVISION ] || die "MODEL_SHA256 / MODEL_REVISION missing; run ./setup.sh first"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "already running, pid $(cat "$PID_FILE") (use ./stop.sh first to restart)"
  exit 0
fi
rm -f "$PID_FILE"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "port $PORT is already in use by another process"
fi

# --- device -------------------------------------------------------------------------
DEVICE="${LAYA_DEVICE:-}"
if [ -z "$DEVICE" ]; then
  DEVICE="$(.venv/bin/python -I -c 'import torch; print("mps" if torch.backends.mps.is_available() else "cpu")')"
fi
case "$DEVICE" in
  mps|cpu) ;;
  *) die "LAYA_DEVICE must be 'mps' or 'cpu' on this machine, got '$DEVICE'" ;;
esac

# --- threads: never above the physical core count -------------------------------------
PHYSICAL_CORES="$(sysctl -n hw.physicalcpu 2>/dev/null || echo 4)"
THREADS="${LAYA_THREADS:-$PHYSICAL_CORES}"
case "$THREADS" in ''|*[!0-9]*) die "LAYA_THREADS must be a positive integer" ;; esac
if [ "$THREADS" -lt 1 ]; then THREADS=1; fi
if [ "$THREADS" -gt "$PHYSICAL_CORES" ]; then THREADS="$PHYSICAL_CORES"; fi

# --- integrity pins, enforced by laya before any weight is parsed ---------------------
MODEL_SHA="$(cut -d' ' -f1 MODEL_SHA256)"
MODEL_REV="$(tr -d '[:space:]' < MODEL_REVISION)"

# --- environment ----------------------------------------------------------------------
export LAYA_HOST="$HOST"
export LAYA_PORT="$PORT"
export LAYA_MODELS="typed-decisions"
export LAYA_PRELOAD="1"
export LAYA_AUTO_TASK="0"
export LAYA_DEVICE="$DEVICE"
export LAYA_THREADS="$THREADS"
export LAYA_REVISION="$MODEL_REV"
export LAYA_SHA256_DIGESTS="{\"typed-decisions\":{\"model.safetensors\":\"$MODEL_SHA\"}}"
export HF_HOME="$HERE/.cache/hf-home"
export HF_HUB_CACHE="$HERE/.cache/hf"
export HF_HUB_OFFLINE="1"
export TRANSFORMERS_OFFLINE="1"
export HF_HUB_DISABLE_TELEMETRY="1"
export HF_HUB_DISABLE_IMPLICIT_TOKEN="1"
export DO_NOT_TRACK="1"
unset HF_TOKEN HUGGING_FACE_HUB_TOKEN HF_ENDPOINT LAYA_API_KEY LAYA_DEFAULT_MODEL LAYA_ROOT_PATH

{
  echo "=== $(date '+%Y-%m-%dT%H:%M:%S%z') start host=$HOST port=$PORT device=$DEVICE threads=$THREADS revision=$MODEL_REV"
} >> "$LOG_FILE"

# perl setsid detaches the server from this shell's session, so closing the terminal that ran
# serve.sh does not kill it. exec keeps the PID, so $! is the server's PID.
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec failed: $!\n"' -- \
  "$HERE/.venv/bin/laya-serve" >> "$LOG_FILE" 2>&1 < /dev/null &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

echo "starting laya-serve pid $SERVER_PID on http://$HOST:$PORT (device=$DEVICE, threads=$THREADS)"
echo "waiting for the checkpoint to load (log: $LOG_FILE)"

deadline=$(( $(date +%s) + READY_TIMEOUT_S ))
while :; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "server exited during startup; last log lines:" >&2
    tail -n 25 "$LOG_FILE" >&2
    rm -f "$PID_FILE"
    exit 1
  fi
  if health="$(curl -fsS --max-time 2 "http://$HOST:$PORT/health" 2>/dev/null)"; then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "timed out after ${READY_TIMEOUT_S}s waiting for /health; last log lines:" >&2
    tail -n 25 "$LOG_FILE" >&2
    exit 1
  fi
  sleep 0.5
done

echo "ready: $health"
echo "pid $SERVER_PID, rss $(ps -o rss= -p "$SERVER_PID" | awk '{printf "%.0f MB", $1/1024}')"
