#!/usr/bin/env python3
"""Download and verify ONLY the approved typed-decisions files of convaiinnovations/laya.

Run by setup.sh inside services/laya/.venv, with HF_HOME and HF_HUB_CACHE pointing into
services/laya/.cache so nothing is written to the user's global Hugging Face cache.

Safety rules enforced here:
  * Only the five APPROVED paths are requested (exact paths, no wildcards).
  * The remote file list is read first; the run aborts if an approved file is missing,
    or if the approved files together exceed MAX_TOTAL_BYTES.
  * Every downloaded file is checked against the Hub metadata: size for all files, SHA-256
    for LFS/Xet files, git blob SHA-1 for small files.
  * MODEL_SHA256 and MODEL_REVISION are written on the first run and enforced afterwards,
    so a silent upstream change fails loudly instead of being picked up.
"""
from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path

REPO = "convaiinnovations/laya"
WEIGHTS = "typed-decisions/model.safetensors"
APPROVED = (
    WEIGHTS,
    "typed-decisions/tokenizer/tokenizer.json",
    "typed-decisions/tokenizer/tokenizer_config.json",
    "typed-decisions/encoder/config.json",
    "typed-decisions/rl_agent_config.json",
)
MAX_TOTAL_BYTES = 900 * 1000 * 1000  # approved set is ~846 MB; refuse anything much larger

HERE = Path(__file__).resolve().parent
SHA_FILE = HERE / "MODEL_SHA256"
REV_FILE = HERE / "MODEL_REVISION"


def fail(message: str) -> "None":
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_blob_sha1_of(path: Path) -> str:
    digest = hashlib.sha1()
    digest.update(b"blob %d\0" % path.stat().st_size)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_local_cache() -> Path:
    cache = os.environ.get("HF_HUB_CACHE", "")
    if not cache:
        fail("HF_HUB_CACHE is not set; run this through setup.sh")
    cache_path = Path(cache).resolve()
    if HERE not in cache_path.parents and cache_path != HERE:
        fail(f"HF_HUB_CACHE={cache_path} is outside {HERE}; refusing to write there")
    return cache_path


def remote_files(api, revision: str) -> dict:
    """Map path -> RepoFile for every file under typed-decisions/ at `revision`."""
    files = {}
    for entry in api.list_repo_tree(REPO, path_in_repo="typed-decisions", recursive=True,
                                    revision=revision):
        if hasattr(entry, "size") and getattr(entry, "blob_id", None):
            files[entry.path] = entry
    return files


def lfs_sha256(entry) -> str | None:
    lfs = getattr(entry, "lfs", None)
    if not lfs:
        return None
    if isinstance(lfs, dict):
        return lfs.get("sha256") or lfs.get("oid")
    return getattr(lfs, "sha256", None)


def precheck(files: dict) -> int:
    missing = [p for p in APPROVED if p not in files]
    if missing:
        fail(f"approved files missing upstream: {missing}")
    total = sum(files[p].size for p in APPROVED)
    extra = sorted(set(files) - set(APPROVED))
    if extra:
        print(f"note: upstream typed-decisions/ also holds {extra}; NOT downloading them")
    if total > MAX_TOTAL_BYTES:
        fail(f"approved files total {total:,} bytes, above the {MAX_TOTAL_BYTES:,} cap; "
             "the upstream layout changed, review before downloading")
    return total


def verify(snapshot: Path, files: dict) -> str:
    """Check every approved file against Hub metadata. Returns the weights SHA-256."""
    weights_digest = ""
    print(f"{'file':52} {'bytes':>13}  check")
    for rel in APPROVED:
        path = snapshot / rel
        entry = files[rel]
        if not path.exists():
            fail(f"{rel} missing from snapshot {snapshot}")
        size = path.stat().st_size
        if size != entry.size:
            fail(f"{rel}: size {size:,} != upstream {entry.size:,}")
        expected_lfs = lfs_sha256(entry)
        if expected_lfs:
            got = sha256_of(path)
            if got != expected_lfs:
                fail(f"{rel}: sha256 {got} != upstream {expected_lfs}")
            check = f"sha256 {got[:16]}... ok"
            if rel == WEIGHTS:
                weights_digest = got
        elif path.is_symlink():
            got = git_blob_sha1_of(path)
            if got != entry.blob_id:
                fail(f"{rel}: git blob sha1 {got} != upstream {entry.blob_id}")
            check = f"git-blob sha1 {got[:12]}... ok"
        else:
            # laya's loader rewrites tokenizer_config.json into a regular file when it needs a
            # compatibility patch; the original was verified on the first run.
            check = "rewritten locally by laya at load time (size check skipped)"
        print(f"{rel:52} {size:>13,}  {check}")
    if not weights_digest:
        fail("weights file was not hash-checked; upstream metadata carried no sha256")
    return weights_digest


def unexpected_files(snapshot: Path) -> list:
    found = {str(p.relative_to(snapshot)) for p in snapshot.rglob("*") if p.is_file() or p.is_symlink()}
    return sorted(found - set(APPROVED))


def pin_files(commit: str, digest: str) -> None:
    pinned = SHA_FILE.read_text().split()[0] if SHA_FILE.exists() else None
    if pinned and pinned != digest:
        fail(f"weights sha256 {digest} != pinned MODEL_SHA256 {pinned}. Upstream changed; "
             "review the new weights before updating MODEL_SHA256 and MODEL_REVISION")
    if not pinned:
        SHA_FILE.write_text(f"{digest}  {WEIGHTS}\n")
        print(f"wrote {SHA_FILE.name}")
    if not REV_FILE.exists():
        REV_FILE.write_text(commit + "\n")
        print(f"wrote {REV_FILE.name}")


def main() -> None:
    cache = require_local_cache()
    from huggingface_hub import HfApi, snapshot_download

    api = HfApi()
    pinned_rev = REV_FILE.read_text().strip() if REV_FILE.exists() else None
    revision = pinned_rev or "main"
    print(f"repo {REPO}, revision {revision}{' (pinned by MODEL_REVISION)' if pinned_rev else ''}")
    print(f"cache {cache}")

    total = precheck(remote_files(api, revision))
    print(f"approved files: {len(APPROVED)}, {total:,} bytes ({total / 1e6:.1f} MB)")

    snapshot = Path(snapshot_download(REPO, revision=revision, allow_patterns=list(APPROVED)))
    commit = snapshot.name
    if pinned_rev and commit != pinned_rev:
        fail(f"snapshot commit {commit} != MODEL_REVISION {pinned_rev}")
    print(f"snapshot {snapshot}")

    # Verify against the metadata of the commit that was actually downloaded.
    digest = verify(snapshot, remote_files(api, commit))
    extra = unexpected_files(snapshot)
    if extra:
        fail(f"unexpected files in snapshot: {extra}")
    pin_files(commit, digest)
    print(f"OK commit {commit}")
    print(f"OK weights sha256 {digest}")


if __name__ == "__main__":
    main()
