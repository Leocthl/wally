#!/usr/bin/env node
/**
 * Download and verify ONLY the pinned Qwen3.5 GGUF files into services/qwen/.cache (or QWEN_CACHE_DIR). Node 22+, no packages.
 * Called by setup.sh; safe to re-run (a verified file is never downloaded again).
 *
 *   node fetch_model.mjs            both models and the 9b vision projector (9b, 4b, 9b-vision)
 *   node fetch_model.mjs 9b         one model
 *   node fetch_model.mjs 9b-vision  only the 9b model's vision projector (the photo feature)
 *
 * Safety rules enforced here:
 *   - exact file names from MODELS below, no wildcard, no other file (the one projector is the 9b model's)
 *   - the Hub metadata of the revision is read first; the run stops if the file is missing, larger than its
 *     cap, or the selected files together exceed TOTAL_CAP_BYTES
 *   - every file is checked against the SHA-256 in the Hub's LFS metadata of that exact commit
 *   - MODEL_REVISION and MODEL_SHA256 are written on the first run and enforced afterwards, so a silent
 *     upstream change fails loudly instead of being picked up
 *   - https only, no token or cookie is sent; the download goes through curl (resumable)
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.QWEN_CACHE_DIR || join(HERE, '.cache'); // an empty value means unset, as in serve.sh
const REV_FILE = join(HERE, 'MODEL_REVISION');
const SHA_FILE = join(HERE, 'MODEL_SHA256');
const HUB = 'https://huggingface.co';
const META_TIMEOUT_MS = 30_000;

/** Pinned sources. Qwen publishes no GGUF for Qwen3.5, so these are bartowski's imatrix quants (llama.cpp b9222). */
export const MODELS = {
  '9b': { repo: 'bartowski/Qwen_Qwen3.5-9B-GGUF', file: 'Qwen_Qwen3.5-9B-Q4_K_M.gguf', maxBytes: 7_000_000_000 },
  '4b': { repo: 'bartowski/Qwen_Qwen3.5-4B-GGUF', file: 'Qwen_Qwen3.5-4B-Q4_K_M.gguf', maxBytes: 3_500_000_000 },
  // The 9b model's multimodal projector (f16), same repo and commit as the 9b weights: lets the server read a picture.
  '9b-vision': { repo: 'bartowski/Qwen_Qwen3.5-9B-GGUF', file: 'mmproj-Qwen_Qwen3.5-9B-f16.gguf', maxBytes: 1_000_000_000 },
};
/** Brief: download nothing bigger than 12 GB in total. */
const TOTAL_CAP_BYTES = 12_000_000_000;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/** MODEL_REVISION lines: "<key> <repo> <commit>". */
function readRevisions() {
  if (!existsSync(REV_FILE)) return new Map();
  const lines = readFileSync(REV_FILE, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
  return new Map(lines.map((l) => l.split(/\s+/)).map(([key, repo, commit]) => [key, { repo, commit }]));
}

/** MODEL_SHA256 lines in shasum format: "<sha256>  <file>" (so `shasum -a 256 -c` works inside .cache). */
function readShas() {
  if (!existsSync(SHA_FILE)) return new Map();
  const lines = readFileSync(SHA_FILE, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '');
  return new Map(lines.map((l) => l.split(/\s+/)).map(([sha, file]) => [file, sha]));
}

async function hubMetadata(repo, revision, file) {
  const url = `${HUB}/api/models/${repo}/revision/${encodeURIComponent(revision)}?blobs=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(META_TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (!res.ok) fail(`${url} answered HTTP ${res.status}`);
  const json = await res.json();
  const entry = (json.siblings ?? []).find((s) => s.rfilename === file);
  if (entry === undefined) fail(`${file} is not in ${repo} at ${revision}`);
  const sha256 = entry.lfs?.sha256;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) fail(`${file}: the Hub metadata carries no LFS sha256`);
  const size = entry.lfs?.size ?? entry.size;
  if (!Number.isSafeInteger(size) || size <= 0) fail(`${file}: the Hub metadata carries no size`);
  if (typeof json.sha !== 'string' || !/^[0-9a-f]{40}$/.test(json.sha)) fail(`${repo}: no commit sha for ${revision}`);
  return { commit: json.sha, sha256, size, licence: json.cardData?.license ?? 'unknown' };
}

function sha256Of(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

function download(repo, commit, file, partPath) {
  const url = `${HUB}/${repo}/resolve/${commit}/${file}`;
  console.log(`downloading ${url}`);
  const run = spawnSync(
    'curl',
    ['-L', '--fail', '--proto', '=https', '--proto-redir', '=https', '--retry', '5', '--retry-delay', '3', '-C', '-', '-o', partPath, url],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) fail(`curl exited with ${run.status ?? run.signal}; re-run setup.sh to resume`);
}

function pin(key, repo, commit, file, sha256) {
  const revisions = readRevisions();
  if (!revisions.has(key)) {
    const header = existsSync(REV_FILE) ? '' : '# key repo commit (written by fetch_model.mjs on the first download, enforced afterwards)\n';
    writeFileSync(REV_FILE, `${existsSync(REV_FILE) ? readFileSync(REV_FILE, 'utf8') : header}${key} ${repo} ${commit}\n`);
    console.log(`pinned ${key} ${repo} ${commit} in MODEL_REVISION`);
  }
  if (!readShas().has(file)) {
    writeFileSync(SHA_FILE, `${existsSync(SHA_FILE) ? readFileSync(SHA_FILE, 'utf8') : ''}${sha256}  ${file}\n`);
    console.log(`pinned ${file} in MODEL_SHA256`);
  }
}

async function fetchOne(key, meta) {
  const { repo, file } = MODELS[key];
  const target = join(CACHE, file);
  const pinnedSha = readShas().get(file);
  if (pinnedSha !== undefined && pinnedSha !== meta.sha256) fail(`${file}: Hub sha256 ${meta.sha256} != pinned ${pinnedSha}`);
  if (existsSync(target)) {
    const got = await sha256Of(target);
    if (got !== meta.sha256) fail(`${target} has sha256 ${got}, expected ${meta.sha256}; delete it and re-run`);
    console.log(`${file} already present, sha256 ok`);
  } else {
    const part = `${target}.part`;
    const complete = existsSync(part) && statSync(part).size === meta.size;
    if (!complete) download(repo, meta.commit, file, part);
    const size = statSync(part).size;
    if (size !== meta.size) fail(`${file}: size ${size} != Hub ${meta.size}`);
    const got = await sha256Of(part);
    if (got !== meta.sha256) fail(`${file}: sha256 ${got} != Hub ${meta.sha256}; delete ${part} and re-run`);
    renameSync(part, target);
    console.log(`${file} downloaded, ${size} bytes, sha256 ok`);
  }
  pin(key, repo, meta.commit, file, meta.sha256);
}

async function main() {
  const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(MODELS);
  const unknown = keys.filter((k) => !Object.hasOwn(MODELS, k));
  if (unknown.length > 0) fail(`unknown model key(s) ${unknown.join(', ')}; known: ${Object.keys(MODELS).join(', ')}`);
  mkdirSync(CACHE, { recursive: true });
  const revisions = readRevisions();
  const plans = [];
  for (const key of keys) {
    const { repo, file, maxBytes } = MODELS[key];
    const pinned = revisions.get(key);
    if (pinned !== undefined && pinned.repo !== repo) fail(`MODEL_REVISION pins ${key} to ${pinned.repo}, not ${repo}`);
    const revision = pinned?.commit ?? 'main';
    const meta = await hubMetadata(repo, revision, file);
    if (pinned !== undefined && meta.commit !== pinned.commit) fail(`${repo}: Hub commit ${meta.commit} != pinned ${pinned.commit}`);
    if (meta.size > maxBytes) fail(`${file} is ${meta.size} bytes, above its ${maxBytes} cap; review before downloading`);
    console.log(`${key}: ${repo}@${meta.commit} ${file} ${meta.size} bytes, licence ${meta.licence}${pinned ? ' (pinned)' : ''}`);
    plans.push({ key, meta });
  }
  const total = plans.reduce((sum, p) => sum + p.meta.size, 0);
  if (total > TOTAL_CAP_BYTES) fail(`selected files total ${total} bytes, above the ${TOTAL_CAP_BYTES} cap`);
  for (const { key, meta } of plans) await fetchOne(key, meta);
  console.log('OK');
}

await main();
