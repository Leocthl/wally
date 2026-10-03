# Offline receipt verifier (C-09, T-V1)

- **What**: one static page that checks Wally's receipts (the signed log) with no server and no network. Paste or load the receipts (JSONL), the public keys JSON (`{ engine: [...], delegator, ... }`, as in `data/public-keys.json`) and, optionally, the head checkpoint (`{ log_id, seq, entry_hash }`).
- **Rail SIMULATED.** Demo keys are throwaway.

## Build and open
| Step | Command |
|---|---|
| Build the one file | `pnpm verifier` (or `pnpm --filter @wally/verifier build`) |
| Open | `apps/verifier/dist/index.html` straight from disk (double-click; `file://` works) |
| Browser check | `pnpm --filter @wally/verifier e2e` (builds, then opens the file offline in headless Chromium from the local Playwright cache) |
| Dev server | `pnpm --filter @wally/verifier dev` (module scripts, no CSP; not the booth page) |

- `dist/index.html` is self-contained: one classic inline script, one inline style, no external file, font or image.
- **CSP** in the page: `default-src 'none'`, `connect-src 'none'`, scripts and styles only by SHA-256 hash.
- No `'unsafe-eval'`: the schema validators in `@wally/core` are compiled ahead of time (`pnpm gen:types`, ajv standalone), so the page never calls `eval` or `new Function`; `test/build.test.ts` fails if it does.
- The build fails if the page contains `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, a module script, `<link>`, `<img>`, CSS `url()` and similar (`build/scan.ts`).

## Use
- The names below are developer mode's; plain mode's are in parentheses (next section).
- **Load demo log** ("Try the sample receipts") fills all three inputs with the SIMULATED golden log (`src/demo`, copies of `packages/core/test/golden`, test keys, not the booth keys). Then **Verify** ("Check the receipts").
- **Tamper** ("Try changing one receipt") flips one byte of a copy: the first DECISION's `approved_limit_minor`, else a card limit or amount, else the first entry's time. The note names the entry, field, old and new value, line and column. **Restore** ("Put it back") puts the original back. Both re-verify.
- **Result**: PASS (entries, head seq, head hash prefix, checkpoint match) or FAIL (first failing seq, reason code, plain words, library detail) or NOT VERIFIED (input unreadable). Any edit clears the result.
- **Entries**: a status disc (tick, cross, dashed ring), seq, kind, time, then verified, broken or not checked per entry. A short link between two rows draws the chain.

## Plain and developer mode
- **Two modes, one check**: `plain` is the default, for a person who cannot read a hash; `developer` is the page above, unchanged. Same state, same verdict, same `data-outcome`, `data-head-seq`, `data-failed-seq` and `data-reason` on the card; only the words and the folding differ. The footer, the demo sentence and the Rail SIMULATED chip read the same in both.
- **Switch**: "Show technical details" under the intro, in both modes (`role="switch"`, a real button, 44px, Space and Enter). Flipping it rebuilds the page from the state it holds: boxes, verdict, change and notice stay, focus goes to the new switch, and the entrance does not replay (`data-quiet`, switched off in `motion.css`; the next Verify press animates as before).
- **Where the mode comes from**: `?dev=1` (developer) or `?dev=0` (plain) for one load, else `localStorage["wally:mode"]` (the key the Wally app uses, so at `/verifier/` they share it), else plain. The switch stores its choice and takes `dev` out of the address. Every storage and history call is guarded: from `file://` the store may be blocked and a browser may refuse the address rewrite, and then a `?dev` in the address stays (and wins on the next load) until the page is reopened without it. `src/mode.ts` sets `<html data-mode>`.
- **Plain shows**: PASS with "All N receipts are untouched" and, when no saved checkpoint reaches the last receipt (none, or an older one), a line that receipts cut off the end would go unnoticed. A FAIL reads "Changed at receipt N" for an altered receipt, "Problem at receipt N" for a broken rule (NO_DECISION, DUPLICATE, CONSENT, OVERSPEND, AFTER_REVOKE: every hash held, so nothing was altered), or says the list does not match the saved checkpoint (a list cut short); then one sentence for why and what was and was not checked. Receipts are numbered from 1, with a label ("Approved", "You said no"), Hong Kong time ("Time not readable" when the text is not a time, never quoted) and untouched, changed or not checked. The change note is one sentence with HK$ amounts; it says "the check caught it" only when the check failed at that receipt. The three boxes are folded under "Check your own receipts", opened when a box has an error.
- **The closed "Show the details" block** holds the four facts on a PASS (receipts, log id, head hash prefix, checkpoint line) and the failure code on a FAIL, and nothing taken from a log line or the library: no entry kind (MANDATE_SEALED, CARD_EVENT, ...) appears anywhere in plain mode's text, closed blocks included, and a row whose kind it cannot map reads "A receipt". The library's Detail sentence, a stopped check's error message, the change's field path and the kind column are developer mode's; the switch keeps the state, so flipping it shows them for the same result. Each box's own message stays under its box in the folded panel, which a new input error opens; the NOT VERIFIED card has no disclosure.
- **Wording** is `src/plain/` (the shared table, EN and a zh-HK draft). The row labels are read from the unverified line with the own-property readers of `src/entry-fields.ts`, so a hostile line cannot reach anything.

## Look, language and motion
- **Look**: the Wally app's cool palette and shield icons (shield-check, shield-alert, dashed shield), copied into `src/styles/tokens.css` because the page may not import across apps. Pill buttons, rounded cards, SIMULATED chip as in the app; red only for a failed check. `test/tokens.test.ts` checks the plain-value fallback against every `light-dark()` pair and the AA contrast of the pairs in use, light and dark.
- **Phone first**: one column. Buttons, verdict and the first entries come before the three text areas, so Load demo log, Verify, Tamper, Restore can be recorded on one screen. From 960px two columns (run column left, inputs right); DOM order is the visual order at every width.
- **One language at a time**: EN | 繁 in the header (`role="radiogroup"`). The default follows `navigator.languages` (zh gives zh-HK, anything else en); a choice is kept in `localStorage["wally:lang"]`, the key the app uses, so on the booth origin it carries over. `src/lang.ts` sets `<html data-lang>` and `lang`. Both texts stay in the DOM and `styles/verifier.css` hides one with `display: none`, so a screen reader skips it and switching rebuilds nothing. Storage access is guarded: blocked storage never breaks the page.
- **Motion**: CSS only, transform and opacity only (`styles/motion.css`). The verdict rises in and its disc pops. PASS lights the entries in one after another; FAIL lights those before the break, lands the broken one last with one shake and fades the rest in dashed. The order is set through the CSSOM (`--i` on each row, `--step` on the list; `src/motion.ts` caps the stagger so a long log still lights quickly) because an inline `style` attribute is blocked by the page's CSP. A Verify press builds a new verdict, so it replays; typing, a notice, the language switch and the mode switch do not, and the empty page never animates. Reduced motion: nothing moves.

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
- Also: tokens (fallback and contrast), the language toggle (default, memory, blocked storage, keys), motion hooks (row order, what replays, transform and opacity only), and design (markup, words on screen, phone rules in the style sheets).
- Both modes: the mode store (default, `?dev`, memory, blocked storage), the switch (state, focus, kept state, quiet rebuild), the plain page (verdict, receipts, change note, box panel, notices), the 14 plain reasons and the 16 event labels against the shared table, hostile lines, a walk of the visible plain text in twelve states and both languages that finds none of the technical words, and a walk of `document.body.textContent` (closed blocks included) that finds none of the six entry kinds, while developer mode still shows them. Mounting tests use `mountDeveloper` or `mountPlain` from `test/helpers.ts`; a test that pins the technical wording mounts in developer mode.
- `pnpm e2e` opens the built file in Chromium offline, in a desktop and a phone profile: judge flow in developer mode (`?dev=1`), the plain default and its switch, 44px targets, no sideways scroll, dark scheme, reduced motion, EN | 繁, no animation on the empty page or after a mode flip, no CSP violation.
- Regenerate the demo after a core format change: `UPDATE_GOLDEN=1 pnpm vitest run --project core verify-golden`, then copy the three golden files into `src/demo/`.
