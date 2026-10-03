#!/usr/bin/env bash
# One command for the booth Mac: start the two local model servers (each start is idempotent), warm both up, then the booth.
#   pnpm booth          booth on 127.0.0.1:8787
#   pnpm booth:lan      booth for phones on the same Wi-Fi (set WALLY_PUBLIC_URL first for the practice-copy QR)
# A model server that fails to start or warm up is a WARN, not a stop: the booth still runs (Laya down: every judged
# decision escalates R10.unavailable; Qwen down: the planner falls back, see docs/06 Fallbacks).
# BOOTH_UP_NO_BOOTH=1 stops after the warm-up (a rehearsal of the start-up, or a check that both servers answer).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Keep this Mac awake for as long as the booth runs (macOS). The exec below keeps this PID, so caffeinate waits for the booth itself.
if command -v caffeinate >/dev/null 2>&1; then caffeinate -dimsu -w $$ >/dev/null 2>&1 & fi

step() { printf '\n== %s\n' "$1"; }
warn() { printf 'WARN: %s\n' "$1" >&2; }

step "Laya (judge) on 127.0.0.1:8808"
services/laya/serve.sh || warn "Laya did not start; judged decisions will escalate (R10.unavailable) until it is back"
step "Qwen (planner, sentence reader, photo reader) on 127.0.0.1:8809"
services/qwen/serve.sh || warn "Qwen did not start; the booth falls back to PLANNER_PROVIDER=rule, else replay"

step "Warm-up (the first call after a start is slow)"
node services/laya/smoke.mjs --runs 3 --warmup 2 --skip-rotation >/dev/null 2>&1 && echo "Laya: answers" || warn "Laya did not answer the warm-up"
node services/qwen/smoke.mjs --runs 2 --warmup 1 >/dev/null 2>&1 && echo "Qwen: answers" || warn "Qwen did not answer the warm-up"

if [ "${BOOTH_UP_NO_BOOTH:-}" = "1" ]; then
  echo; echo "BOOTH_UP_NO_BOOTH=1: not starting the booth"
  exit 0
fi

step "Booth"
if [ "${1:-}" = "--lan" ]; then exec pnpm demo:lan; fi
exec pnpm demo
