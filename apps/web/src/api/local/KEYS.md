# Delegator key on the phone (M-09 design)

## Today (on-device mode, DEMO SHORTCUT)
- **Every key in the page**: the page makes throwaway engine and delegator keys (first load and every reset; `persist/keys.ts` when the session is kept, `src/booth/backend/keys.ts` otherwise) and signs the seal, revocations and escalation answers itself.
- **Said plainly**: `ApiInfo.demoShortcut` and the info notes say the page holds every key and the answers are recorded.
- **Kept on this phone**: since the persist lane the two keys are also stored, with the log, so a reload carries on with the same keys (section below). They are SIMULATED demo keys, already readable by the page, worth nothing outside this demo. They sit in localStorage as plain key files, so any script on the origin, and anyone who can open this browser on the phone, can read them; Start the demo over deletes them.
- **Mum (family budget)**: a SIMULATED parent key, made in memory the first time a family budget is used and dropped on reset; the page signs her ceiling credential. It is checked at seal time and is not in the child's log, so the offline verifier cannot check that link. It is never stored, so a family budget is never kept either.

## Kept session (on-device mode)
- **Where**: one localStorage record, `wally:session:v1` (`persist/record.ts`): `v` 1, `savedAt`, the two key files (`core/crypto` key-file shape), the log as JSONL, the head checkpoint. Nothing else: no cards, no rail state, no derived data.
- **Why the log is enough**: the orchestrator folds everything from the log, and the SIMULATED rail is rebuilt from it (`persist/rail.ts`, played into a new RailSim and compared card by card).
- **Save**: after any append to the log (a short pause first, so a burst is one write), and at once on `pagehide` and when the page is hidden. Never from a view, so the tamper demo's changed copy is never stored. A save that fails removes the record: a stale record would undo a purchase or a cancel.
- **Restore** (`persist/plan.ts`, then `persist/resume.ts`): strict record shape and version, valid keys for their slots, the whole hash chain with the stored keys and head, a budget that has not ended, not a family budget; then the seal is made again with the stored credential at the stored time, so seq 0 comes out byte for byte as stored. Any failure removes the record, starts fresh and shows one calm line once.
- **Start the demo over** deletes the record; the fresh budget it seals is not kept until something happens in it.
- **Several tabs**: each tab writes its whole session, the last writer wins, a `storage` event from another tab is ignored (no live merging).
- **Known limits**: "See cheaper options" for a stop made before the reload is not offered (the orchestrator remembers those in memory only); a session over 1.5 million characters is not kept; storage the browser clears (site data, low disk, long inactivity) ends the session; a did:key still cannot be rotated.

## Target split
- **Engine key** stays with the operator (the Node server, or the page in on-device mode). It signs log entries only.
- **Delegator key** lives on the shopper's phone and signs only three things: the mandate credential (seal), a revocation (revoke), an escalation answer.
- **Engine never holds it**: the orchestrator already takes the delegator did:key and verifies signed inputs (`delegatorDid` in `OrchestratorDeps`); nothing in core changes.

## Generation
- **WebCrypto first**: `crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])` with `extractable: false`, where the browser supports Ed25519 in WebCrypto.
- **Fallback**: `@noble/curves` Ed25519 (already in core) when WebCrypto Ed25519 is missing; the secret is then raw bytes in the page and in storage, so the UI says the key is software-only.
- **did:key** from the raw public key (`exportKey("raw")` on the public key is allowed for a non-extractable pair); the did is the credential issuer and the pinned `delegatorDid`.

## Storage
- **IndexedDB** holds the `CryptoKeyPair` (structured clone keeps it non-extractable) or the noble seed, keyed by mandate id, plus the did.
- **Eviction risk**: browsers may clear site data under storage pressure or after inactivity (Safari ITP). Ask for `navigator.storage.persist()`; on a lost key the shopper can no longer revoke or answer, so the packet must stop on its own: expiry (R2), and every open escalation expires to DENY (R11).
- **No sync, no export**: the key never leaves the device; a new phone means a new mandate.

## Signing through the unchanged core port
- **`AsyncSigner`** (`signer.ts`): `did` plus `sign(bytes): Promise<bytes>`. WebCrypto signs asynchronously; a confirmation screen waits for the shopper.
- **`signWithAsync`** bridges to the synchronous core `Signer`: a dry run captures the exact bytes the core signs, the async signer signs them, a second run uses the signatures and refuses any byte that changed (fail closed).
- **`memoryAsyncSigner`** wraps today's in-memory signer; tests pin it to the synchronous result (Ed25519 is deterministic).
- **Next**: a `WebCryptoAsyncSigner` and an `IndexedDbKeyStore` behind the same interface; the client then signs seal, revoke and answers with them.

## Audit (s-audit report, section 5a)
- **Status**: these are the audit's requirements for a phone-held key. Today only the offline verifier page carries a strict CSP; the app itself ships without one.
- **While the page runs, the key is usable**: non-extractable stops copying the key, not using it. XSS or a malicious same-origin page can call `sign` for as long as it runs.
- **Strict CSP**: no inline script except by hash, no `unsafe-eval` (the schema validators are compiled ahead of time, so the verifier and this page need none), `connect-src` limited to the booth server in live mode and `'none'` in on-device mode, no third-party script.
- **Confirmation screen shows what is signed**: before each signature, the page renders the decoded payload (mandate rules and budget, the revoke target, the escalation decision and choice) from the same object the core signs, and signs only after an explicit press. `signWithAsync` hands the signer the exact bytes, so the screen can hash and show them.
- **Own origin**: serve the signing page from its own origin, with no other app on it.
- **Storage eviction**: see Storage; the packet stops by expiry, never by a lost key.

## Open
- **Browser support**: WebCrypto Ed25519 is not in every phone browser yet; check the booth phones before relying on it.
- **Passkeys (WebAuthn)** could sign instead, but they sign a WebAuthn assertion, not raw Ed25519 over our message; that needs a new proof type and verifier support.
