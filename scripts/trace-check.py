#!/usr/bin/env python3
"""Traceability and cross-reference checks (stdlib only). Usage: python3 scripts/trace-check.py
Checks the SR1-SR4 and E1-E5 matrix in 01, ID coverage in 02/06/10, lane task IDs, file links."""
import re, os, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    f = os.path.join(ROOT, p)
    return open(f, errors="replace").read() if os.path.exists(f) else ""


def nofence(t):
    return re.sub(r"```.*?```", "", t, flags=re.S)


ctx, t01, t02, t05, t06, t07, t10 = (read(p) for p in [
    "docs/00-context.md", "docs/01-product-brief.md", "docs/02-architecture.md", "docs/05-evidence-plan.md",
    "docs/06-demo-script.md", "docs/07-pitch.md", "docs/10-test-plan.md"])
tasks, lanes, plan = read("TASKS.md"), read("docs/lane-prompts.md"), read("docs/03-implementation-plan.md")

out = []


def bad(msg):
    out.append("  FAIL " + msg)


def ok(msg):
    out.append("  ok   " + msg)


T_TOK = r"T-(?:I[1-8]|S[1-6]|H[1-3]|V1|R1|E2E)"
DM_TOK = r"DMR?[1-9]"

print("== traceability matrix in 01 (SR1-SR4, E1-E5)")
for req in ["SR1", "SR2", "SR3", "SR4", "E1", "E2", "E3", "E4", "E5"]:
    rows = [l for l in t01.split("\n") if re.match(r"\|\s*\**" + req + r"\b[^|]*\|", l)]
    if not rows:
        bad(req + ": no row in 01")
        continue
    # take the last matching row (matrix is after the stop table)
    row = rows[-1]
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    tests = re.findall(T_TOK, row)
    dms = re.findall(DM_TOK, row)
    empty = [i for i, c in enumerate(cells) if not c or c in ("-", "tbd", "TBD")]
    msg = req + ": %d cells, tests=%s, demo=%s" % (len(cells), sorted(set(tests)), sorted(set(dms)))
    if len(cells) < 4 or empty or not tests or not dms:
        bad(msg)
    else:
        ok(msg)
    for t in set(tests):
        if t not in t10:
            bad("  %s cites %s but 10-test-plan has no %s" % (req, t, t))
    for d in set(dms):
        if d not in t06:
            bad("  %s cites %s but 06-demo-script has no %s" % (req, d, d))

print("\n".join(out)); out.clear()

print("\n== ID coverage")
for r in ["R%d" % i for i in range(1, 13)]:
    if not re.search(r"\b" + r + r"\b", nofence(t02)) and not re.search(r"\b" + r + r"\b", t02):
        bad("02-architecture lacks " + r)
for i in range(1, 9):
    if not re.search(r"\bI%d\b" % i, t02):
        bad("02-architecture lacks I%d" % i)
    if not re.search(r"T-I%d\b" % i, t10):
        bad("10-test-plan lacks T-I%d" % i)
for s in range(1, 7):
    for name, t in (("01", t01), ("02", t02), ("10", t10)):
        pat = r"\bS%d\b" % s if name != "10" else r"T-S%d\b" % s
        if not re.search(pat, t):
            bad("%s lacks %s" % (name, pat))
for tid in ["T-H1", "T-H2", "T-H3", "T-V1", "T-R1", "T-E2E"]:
    if tid not in t10:
        bad("10-test-plan lacks " + tid)
for d in ["DM%d" % i for i in range(1, 10)] + ["DMR1", "DMR2"]:
    if not re.search(r"\b" + d + r"\b", t06):
        bad("06-demo-script lacks " + d)
for tpl in re.findall(r"R\d+\.[a-z_]+", ctx):
    if tpl not in t02 and tpl not in t01:
        bad("template id %s not used in 01 or 02" % tpl)
print("\n".join(out) or "  ok   all IDs covered"); out.clear()

print("\n== lane prompts vs TASKS")
task_ids = set(re.findall(r"\b([XABCD]-\d{2})\b", tasks))
lane_refs = set(re.findall(r"\b([XABCD]-\d{2})\b", lanes))
missing = sorted(lane_refs - task_ids)
if missing:
    bad("lane-prompts cites task IDs missing from TASKS.md: " + ", ".join(missing))
else:
    ok("%d task IDs in TASKS.md, %d cited by lane prompts, none missing" % (len(task_ids), len(lane_refs)))
for lane in "ABCDX":
    n = len([t for t in task_ids if t.startswith(lane + "-")])
    print("  lane %s: %d tasks" % (lane, n))
print("\n".join(out)); out.clear()

print("\n== file links")
for p in glob.glob(ROOT + "/**/*.md", recursive=True):
    if "node_modules" in p or "/.worktrees/" in p:
        continue
    text = read(os.path.relpath(p, ROOT))
    base = os.path.dirname(p)
    for m in re.finditer(r"\]\(([^)#\s]+\.md)(?:#[^)]*)?\)", text):
        tgt = os.path.normpath(os.path.join(base, m.group(1)))
        if not os.path.exists(tgt):
            bad("%s links to missing %s" % (os.path.relpath(p, ROOT), m.group(1)))
    for m in re.finditer(r"`((?:docs|schemas|data)/[A-Za-z0-9_./-]+\.(?:md|json))`", text):
        tgt = os.path.join(ROOT, m.group(1))
        if not os.path.exists(tgt) and not m.group(1).endswith("public-keys.json"):
            bad("%s cites missing file %s" % (os.path.relpath(p, ROOT), m.group(1)))
print("\n".join(out) or "  ok   all linked files exist"); out.clear()

print("\n== schema fields named in 01 chips vs mandate schema")
ms = read("schemas/mandate.schema.json")
for field in ["budget", "hard_cap", "ask_above", "seller_check", "expires_at", "categories"]:
    print("  %-14s %s" % (field, "in mandate.schema.json" if field in ms else "MISSING"))
