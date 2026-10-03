#!/usr/bin/env bash
# Freeze guard [F16]: nothing may reach the repository after Sun 2026-10-04 13:00 HKT (05:00 UTC).
#   scripts/freeze-guard.sh           checks the clock now (the pre-push hook in .githooks/)
#   scripts/freeze-guard.sh <epoch>   checks a commit time (CI: git log -1 --format=%ct)
# Turn the hook on once per clone: git config core.hooksPath .githooks
set -euo pipefail
FREEZE_EPOCH=1791090000 # 2026-10-04T05:00:00Z
at="${1:-$(date -u +%s)}"
case "$at" in '' | *[!0-9]*) echo "freeze-guard: '$at' is not an epoch time" >&2; exit 2 ;; esac
if [ "$at" -ge "$FREEZE_EPOCH" ]; then
  when="$(date -u -r "$at" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || date -u -d "@$at" '+%Y-%m-%d %H:%M UTC')"
  echo "Freeze guard: $when is at or after the code freeze (2026-10-04 13:00 HKT, F16). Refused." >&2
  exit 1
fi
