#!/usr/bin/env bash
# Run right before the repository is made public (and again after the last commit): a PASS / WARN / FAIL list.
#   scripts/pre-flip-check.sh          exit 1 when any line is FAIL
# It reads the working tree and the whole git history; it changes nothing and needs no network except `gh` for the CI line.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0
pass() { printf 'PASS  %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

# 1. A clean tree that is fully pushed.
if [ -z "$(git status --porcelain)" ]; then pass "working tree is clean"; else bad "uncommitted changes: $(git status --porcelain | wc -l | tr -d ' ') files"; fi
git fetch -q origin 2>/dev/null || warn "could not fetch origin"
ahead="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo '?')"
if [ "$ahead" = "0" ]; then pass "HEAD is on origin/main ($(git rev-parse --short HEAD))"; else bad "HEAD is $ahead commits ahead of origin/main"; fi

# 2. Secrets in the tree and in every blob ever committed (high-confidence patterns only).
SECRET='(sk_(live|test)_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9]{24,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|hf_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,}|vercel_[A-Za-z0-9]{20,})'
hits="$(git grep -nIE "$SECRET" -- . ':!THIRD_PARTY.md' 2>/dev/null | head -5)"
if [ -z "$hits" ]; then pass "no secret patterns in the tree"; else bad "secret-like text in the tree:"; printf '%s\n' "$hits" | cut -c1-160; fi
hist="$(git log --all -p -G"$SECRET" --format='%h' 2>/dev/null | grep -E '^[0-9a-f]{7,}$' | head -3 | tr '\n' ' ')"
if [ -z "$hist" ]; then pass "no secret patterns anywhere in history"; else bad "secret-like text in history, commits: $hist"; fi

# 3. Files that must never be tracked.
tracked_bad="$(git ls-files | grep -E '(^|/)(\.env(\..*)?|\.keys/|\.vercel/|\.data/|data/raw/|.*\.(pem|p12|key|gguf|safetensors|mp4|mov|zip|DS_Store))$' | grep -v '\.env\.example$' | head -5)"
if [ -z "$tracked_bad" ]; then pass "no env, key, model, video or archive file is tracked"; else bad "tracked files that should not be:"; printf '%s\n' "$tracked_bad"; fi
big="$(git ls-files -z | xargs -0 du -k 2>/dev/null | awk '$1 > 1024 {print $1 " KiB " $2}' | head -5)"
if [ -z "$big" ]; then pass "no tracked file over 1 MiB"; else warn "tracked files over 1 MiB:"; printf '%s\n' "$big"; fi

# 4. Personal data.
paths="$(git grep -nI '/Users/[a-zA-Z]' -- . ':!*.md' 2>/dev/null | grep -vE '/Users/(x|you|name|user)\b|/Users/<' | head -3)"
if [ -z "$paths" ]; then pass "no home directory path in the code"; else bad "home path in the tree:"; printf '%s\n' "$paths" | cut -c1-160; fi
mail="$(git grep -nIE '[A-Za-z0-9._%+-]+@(gmail|outlook|hotmail|yahoo|icloud|qq|163)\.com' 2>/dev/null | head -3)"
if [ -z "$mail" ]; then pass "no personal email address in the tree"; else bad "personal email in the tree:"; printf '%s\n' "$mail" | cut -c1-160; fi
authors="$(git log --all --format='%ae' | sort -u)"
if printf '%s' "$authors" | grep -qvE '@users\.noreply\.github\.com$'; then warn "commit author emails in history (public once the repo is): $(printf '%s' "$authors" | tr '\n' ' ')"; else pass "every commit uses a GitHub noreply address"; fi
if git grep -qiE 'leos-mac|\.local:[0-9]' -- 'apps/web/server' 'apps/web/src' 2>/dev/null; then warn "a machine-style hostname appears in the app code"; else pass "no machine hostname in the app code"; fi

# 5. Licence and credits.
for f in LICENSE NOTICE THIRD_PARTY.md README.md; do [ -f "$f" ] && pass "$f exists" || bad "$f is missing"; done
if grep -q 'Apache License' LICENSE 2>/dev/null; then pass "LICENSE is Apache-2.0"; else bad "LICENSE is not the Apache-2.0 text"; fi
if git ls-files | grep -iE '(logo|brand)' | grep -viE 'wally|branding\.test|brand-|brand\.ts|launch-?logo' | grep -qE '\.(png|svg|jpg|jpeg|webp)$'; then warn "a tracked image has logo or brand in its name"; else pass "no tracked logo or brand image"; fi

# 6. Branches, tags and the freeze guard.
others="$(git branch -r | grep -vE 'origin/(HEAD|main)' | head -3)"
if [ -z "$others" ]; then pass "origin has only main"; else warn "other remote branches: $others"; fi
[ "$(git config --get core.hooksPath)" = ".githooks" ] && pass "pre-push freeze guard is on in this clone" || warn "freeze guard off: git config core.hooksPath .githooks"
bash scripts/freeze-guard.sh >/dev/null 2>&1 && pass "the code freeze has not passed" || bad "the code freeze (2026-10-04 13:00 HKT) has passed"

# 7. CI on the pushed commit.
if command -v gh >/dev/null 2>&1; then
  run="$(gh run list --branch main --workflow ci --limit 1 --json conclusion,headSha,status 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print((r[0]["status"], r[0]["conclusion"], r[0]["headSha"][:7]) if r else "none")' 2>/dev/null)"
  case "$run" in
    *"'completed', 'success'"*) pass "CI green: $run" ;;
    "none" | "") warn "no CI run found" ;;
    *) warn "CI is not green yet: $run" ;;
  esac
else warn "gh is not installed: check CI by hand"; fi

echo
if [ "$fail" -eq 0 ]; then echo "No FAIL lines. Read the WARN lines, then decide."; else echo "FAIL lines above: fix them before the repository goes public."; fi
exit "$fail"
