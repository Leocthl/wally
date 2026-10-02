#!/usr/bin/env python3
"""Doc consistency checks (stdlib only). Usage: python3 scripts/docs-check.py [--update-register]
Checks word caps, JSON validity, unknown F-IDs, ID ranges, numbers without a register ID, style tells,
PAN-like digit runs, secret patterns, intro paragraphs, leftover TODO markers."""
import re, sys, glob, os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = os.path.join(ROOT, "docs/facts-register.md")
ADD_DIR = os.path.join(ROOT, "docs/_register-additions")

CAPS = {
    "docs/01-product-brief.md": 600, "docs/02-architecture.md": 1800, "docs/03-implementation-plan.md": 1200,
    "docs/04-design-language.md": 1000, "docs/05-evidence-plan.md": 800, "docs/06-demo-script.md": 700,
    "docs/07-pitch.md": 900, "docs/10-test-plan.md": 500, "docs/09-hkt-delegation-api-ask.md": 520,
}
LINE_CAPS = {"CLAUDE.md": 120, "README.md": 80}
BANNED = ["robust", "seamless", "leverage", "ensure", "crucial", "comprehensive", "delve", "not just",
          "game-changer", "unlock", "empower", "streamline", "cutting-edge", "state-of-the-art", "holistic",
          "synergy", "in today's", "it's worth noting", "let's dive"]
SYN = ["voucher", "kill switch", "kill-switch", "disposable card", "burner", "spending pot", "budget envelope"]


def strip_fences(t):
    return re.sub(r"```.*?```", "", t, flags=re.S)


def words(t):
    """Count word-like tokens: ignores code fences, table pipes/separators, bullets and markdown markers."""
    t = strip_fences(t)
    t = re.sub(r"^\s*\|?[\s:\-|]+\|[\s:\-|]*$", " ", t, flags=re.M)   # table separator rows
    t = t.replace("|", " ")
    t = re.sub(r"[*`#>]", " ", t)
    toks = [w for w in t.split() if re.search(r"[A-Za-z0-9\u4e00-\u9fff]", w)]
    return len(toks)


def short(path):
    rel = os.path.relpath(path, ROOT)
    m = re.match(r"docs/(\d\d)-", rel)
    if m: return m.group(1)
    if rel.startswith("docs/adr/"): return "adr"
    if rel == "docs/lane-prompts.md": return "lanes"
    if rel.startswith("data/"): return "data"
    if rel.startswith("schemas/"): return "schemas"
    return os.path.splitext(os.path.basename(rel))[0]


def register_ids():
    ids = set()
    for p in [REG] + glob.glob(ADD_DIR + "/*.md"):
        if os.path.exists(p):
            for m in re.finditer(r"^\|\s*(F\d+[a-z]?)\s*\|", open(p).read(), flags=re.M):
                ids.add(m.group(1))
    return ids


def expand_refs(text):
    """Return set of base F-ids referenced (handles F1.ceiling, F20-F23, F7a)."""
    refs = set()
    for m in re.finditer(r"\bF(\d+)\s*[-–]\s*F(\d+)\b", text):
        a, b = int(m.group(1)), int(m.group(2))
        if 0 <= b - a <= 40:
            refs.update("F%d" % i for i in range(a, b + 1))
    for m in re.finditer(r"\bF(\d+[a-z]?)(?:\.\w+)?\b", text):
        refs.add("F" + m.group(1))
    return refs


def main():
    files = [p for p in glob.glob(ROOT + "/**/*", recursive=True)
             if os.path.isfile(p) and p.endswith((".md", ".json", ".example")) and "node_modules" not in p and ".worktrees" not in os.path.relpath(p, ROOT).split(os.sep)
             and "/_register-additions/" not in p]
    files += [os.path.join(ROOT, ".env.example")]
    files = sorted(set(f for f in files if os.path.exists(f)))
    ids = register_ids()
    used = {}
    problems = []

    for p in files:
        rel = os.path.relpath(p, ROOT)
        text = open(p, errors="replace").read()
        nlines = text.count("\n") + 1
        is_reg = p == REG
        # caps
        if rel in CAPS and words(text) > CAPS[rel]:
            problems.append((rel, "CAP", "%d words > %d" % (words(text), CAPS[rel])))
        if rel in LINE_CAPS and nlines > LINE_CAPS[rel]:
            problems.append((rel, "CAP", "%d lines > %d" % (nlines, LINE_CAPS[rel])))
        if rel.startswith("docs/adr/") and nlines > 16:
            problems.append((rel, "CAP", "%d lines > 15" % nlines))
        if rel.endswith(".json"):
            try:
                json.loads(text)
            except Exception as e:
                problems.append((rel, "JSON", str(e)))
            for r in expand_refs(text):
                used.setdefault(r, set()).add(short(p))
                if r not in ids:
                    problems.append((rel, "F-ID", "unknown %s" % r))
            continue
        # F refs
        if not is_reg:
            for r in expand_refs(text):
                used.setdefault(r, set()).add(short(p))
                if r not in ids:
                    problems.append((rel, "F-ID", "unknown %s" % r))
        # id ranges
        for pat, mx, name in [(r"\bR(\d{1,3})\b", 12, "R"), (r"\bI(\d{1,3})\b", 8, "I"), (r"\bS(\d{1,3})\b", 6, "S"),
                              (r"\bD(\d{1,3})\b", 17, "D"), (r"\bDM(\d{1,3})\b", 9, "DM"), (r"\bE(\d{1,3})\b", 5, "E"),
                              (r"\bSR(\d{1,3})\b", 4, "SR"), (r"\bDIR(\d{1,3})\b", 11, "DIR"), (r"\bU(\d{1,3})\b", 4, "U")]:
            for m in re.finditer(pat, strip_fences(text)):
                if int(m.group(1)) > mx or int(m.group(1)) == 0:
                    ctx = text[max(0, m.start() - 25): m.end() + 25].replace("\n", " ")
                    problems.append((rel, "ID-RANGE", "%s%s ... %s" % (name, m.group(1), ctx)))
        if is_reg:
            continue
        body = strip_fences(text)
        # numbers without nearby F-id (design tokens in 04 are exempt)
        for m in ([] if (rel == "docs/04-design-language.md" or rel.startswith("services/")) else re.finditer(r"HK\$\s?[\d,]+(?:\.\d+)?[mk]?|\b\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*\s?ms\b|\$\d[\d.,]*", body)):
            line_start = body.rfind("\n", 0, m.start()) + 1
            line_end = body.find("\n", m.end())
            line_end = len(body) if line_end < 0 else line_end
            line = body[line_start:line_end]
            window = body[max(line_start, m.start() - 70): min(line_end, m.end() + 70)]
            if not re.search(r"\[F\d|\bF\d+[a-z]?\b", window) and not re.search(r"\[F\d|\bF\d+[a-z]?\b", line):
                problems.append((rel, "NUM", m.group(0) + " | " + line.strip()[:110]))
        # style
        if "—" in text:
            problems.append((rel, "EMDASH", "%d em dashes" % text.count("—")))
        if re.search(r"[\U0001F300-\U0001FAFF☀-➿]", text.replace("✓", "").replace("→", "").replace("⇒", "")):
            problems.append((rel, "EMOJI", "emoji or pictograph present"))
        low = text.lower()
        for w in BANNED:
            if re.search(r"\b" + re.escape(w), low):
                problems.append((rel, "BANNED", w))
        for w in SYN:
            if w in low:
                problems.append((rel, "SYNONYM", w))
        # security
        for m in re.finditer(r"(?<![\w.])(?:\d[ -]?){13,19}(?![\w])", body):
            problems.append((rel, "PAN?", m.group(0)[:30]))
        if re.search(r"cvv\D{0,12}\d{3}", low):
            problems.append((rel, "CVV?", "cvv followed by digits"))
        if re.search(r"sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{8,}|-----BEGIN", text):
            problems.append((rel, "SECRET?", "key-like string"))
        # todo markers
        for m in re.finditer(r"TODO\([^)]*\)[^\n]{0,80}", text):
            problems.append((rel, "TODO", m.group(0)))
        # intro paragraph under heading
        lines = text.split("\n")
        infence = False
        for i, ln in enumerate(lines):
            if ln.strip().startswith("```"):
                infence = not infence
            if infence or not re.match(r"#{1,4} ", ln):
                continue
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                nxt = lines[j]
                if re.match(r"[A-Za-z\"'(]", nxt) and len(nxt) > 90 and not nxt.startswith(("TODO",)):
                    problems.append((rel, "INTRO-PARA", "%s -> %s" % (ln.strip()[:40], nxt.strip()[:60])))

    # report
    order = ["CAP", "JSON", "F-ID", "ID-RANGE", "NUM", "EMDASH", "EMOJI", "BANNED", "SYNONYM", "PAN?", "CVV?", "SECRET?", "TODO", "INTRO-PARA"]
    for kind in order:
        rows = [p for p in problems if p[1] == kind]
        if not rows:
            continue
        print("\n== %s (%d)" % (kind, len(rows)))
        for rel, _, msg in rows[:60]:
            print("  %-42s %s" % (rel, msg))
        if len(rows) > 60:
            print("  ... %d more" % (len(rows) - 60))
    print("\nword counts (outside code fences):")
    for rel in sorted(CAPS):
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            print("  %-42s %5d / %d" % (rel, words(open(p).read()), CAPS[rel]))
    for rel in sorted(LINE_CAPS):
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            print("  %-42s %5d lines / %d" % (rel, open(p).read().count("\n") + 1, LINE_CAPS[rel]))
    unused = sorted(i for i in ids if i not in used)
    print("\nregister ids never cited outside the register:", ", ".join(unused) or "none")

    if "--update-register" in sys.argv:
        text = open(REG).read()
        out = []
        for ln in text.split("\n"):
            m = re.match(r"^\|\s*(F\d+[a-z]?)\s*\|", ln)
            if m and ln.rstrip().endswith("|"):
                cells = ln.rstrip()[:-1].split("|")
                refs = sorted(used.get(m.group(1), []), key=lambda s: (not s[:2].isdigit(), s))
                cells[-1] = " " + (", ".join(refs) if refs else "none") + " "
                ln = "|".join(cells) + "|"
            out.append(ln)
        open(REG, "w").write("\n".join(out))
        print("register 'Used in' column updated")


if __name__ == "__main__":
    main()
