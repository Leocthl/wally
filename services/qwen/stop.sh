#!/usr/bin/env bash
# Stop the local Qwen server. Kills only the PID recorded in qwen-serve.pid, and only if that PID still looks
# like our llama-server on port 8809 (guards against a recycled PID and never touches Laya on 8808).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$HERE/qwen-serve.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "no pid file; nothing to stop"
  exit 0
fi

PID="$(tr -d '[:space:]' < "$PID_FILE")"
case "$PID" in
  ''|*[!0-9]*) echo "ERROR: $PID_FILE does not hold a numeric pid" >&2; exit 1 ;;
esac

if ! kill -0 "$PID" 2>/dev/null; then
  echo "pid $PID is not running; removing stale pid file"
  rm -f "$PID_FILE"
  exit 0
fi

COMMAND="$(ps -p "$PID" -o command= 2>/dev/null || true)"
case "$COMMAND" in
  *llama-server*--port\ 8809*) ;;
  *) echo "ERROR: pid $PID is not the Qwen llama-server on port 8809 ($COMMAND); refusing to kill it" >&2; exit 1 ;;
esac

kill -TERM "$PID"
for _ in $(seq 1 50); do
  kill -0 "$PID" 2>/dev/null || break
  sleep 0.2
done

if kill -0 "$PID" 2>/dev/null; then
  echo "pid $PID still alive after 10 s; sending KILL"
  kill -KILL "$PID"
fi

rm -f "$PID_FILE"
echo "stopped llama-server pid $PID"
