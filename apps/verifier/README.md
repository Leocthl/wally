# Offline log verifier (C-09, T-V1)

- **What**: one static page that checks a Lai See decision log with no server and no network. Paste or load the log (JSONL), the public keys JSON (`{ engine: [...], delegator, ... }`, as in `data/public-keys.json`) and, optionally, the head checkpoint (`{ log_id, seq, entry_hash }`).
- **Rail SIMULATED.** Demo keys are throwaway. Not affiliated with HKT, Tap & Go or Mastercard.

## Build and open
| Step | Command |
|---|---|
| Build the one file | `pnpm verifier` (or `pnpm --filter @laisee/verifier build`) |
| Open | `apps/verifier/dist/index.html` straight from disk (double-click; `file://` works) |
| Browser check | `pnpm --filter @laisee/verifier e2e` (builds, then opens the file offline in headless Chromium from the local Playwright cache) |
| Dev server | `pnpm --filter @laisee/verifier dev` (module scripts, no CSP; not the booth page) |

- `dist/index.html` is self-contained: one classic inline script, one inline style, no external file, font or image.
- **CSP** in the page: `default-src 'none'`, `connect-src 'none'`, scripts and styles only by SHA-256 hash.
- No `'unsafe-eval'`: the schema validators in `@laisee/core` are compiled ahead of time (`pnpm gen:types`, ajv standalone), so the page never calls `eval` or `new Function`; `test/build.test.ts` fails if it does.
- The build fails if the page contains `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, a module script, `<link>`, `<img>`, CSS `url()` and similar (`build/scan.ts`).

## Use
- **Load demo log** fills all three inputs with the SIMULATED golden log (`src/demo`, copies of `packages/core/test/golden`, test keys, not the booth keys). Then **Verify**.
- **Tamper** flips one byte of a copy: the first DECISION's `approved_limit_minor`, else a card limit or amount, else the first entry's time. The note names the entry, field, old and new value, line and column. **Restore** puts the original back. Both re-verify.
- **Result**: PASS (entries, head seq, head hash prefix, checkpoint match) or FAIL (first failing seq, reason code, plain words, library detail) or NOT VERIFIED (input unreadable). Any edit clears the result.
- **Timeline**: seq, kind, time, then verified, broken or not checked per entry.

## What it checks (docs/02 section 11, via `verifyLogText`)
- Keys first (KEYS): a pinned delegator key that is not also an engine key, or nothing is checked.
- Steps 1 to 8: schema and canonical JSON per line, seq order, prev_hash chain, payload hash, entry hash, engine signature against the listed engine keys, the seq 0 mandate credential pinned to the delegator, delegator signatures (escalation answers bound to the escalated decision, mandate and cart), and the checkpoint (TRUNCATED).
- Step 9, consent and money against the signed credential: every card follows a logged APPROVE at its limit, once (NO_DECISION, DUPLICATE); an APPROVE above the ask-above amount or resolving an escalation rests on the delegator's in-time yes for that same cart, once (CONSENT); per-purchase caps, card limits and the sealed budget hold (OVERSPEND); no approval or card outside the validity dates or after a revoke or expiry marker (AFTER_REVOKE).

## What it does not check
- **Re-fold and re-render**: PacketState snapshots inside decisions and rendered explanations are not recomputed; nor are the engine's rule results.
- **Omissions**: an operator who never logs a mint or a charge is not caught offline; only what is logged is checked.
- **Truncation without a checkpoint passes**: a log cut after its last entry looks complete. Paste the checkpoint to catch it.
- Whoever holds the engine key can rewrite entries after the last published checkpoint (02 section 12).
- Keys are taken as pasted: the page cannot tell demo keys from booth keys.

## Limits (ASSUMED, `src/limits.ts`)
- Log up to 2 MiB; keys and checkpoint up to 64 KiB; timeline draws up to 400 rows around the first failure.

## Tests
- `pnpm test` runs `test/*.test.ts` in jsdom: page logic (T-V1 tamper classes, reorder, duplicate, drop, truncation, wrong keys, bad input, `__proto__`), the DOM flow, no network calls, no HTML injection, demo files in step with core, and an in-process build that checks the single file, its CSP hashes and runs the inlined script.
- Regenerate the demo after a core format change: `UPDATE_GOLDEN=1 pnpm vitest run --project core verify-golden`, then copy the three golden files into `src/demo/`.
