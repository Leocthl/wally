// A small port of the checks in scripts/docs-check.py that matter for generated markdown (the script skips
// files under .worktrees, so a worktree run would not see them). Returns one problem string per finding.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REGISTER = fileURLToPath(new URL("../../../../docs/facts-register.md", import.meta.url));
const BANNED = [
  "robust", "seamless", "leverage", "ensure", "crucial", "comprehensive", "delve", "not just", "game-changer", "unlock",
  "empower", "streamline", "cutting-edge", "state-of-the-art", "holistic", "synergy", "in today's", "it's worth noting", "let's dive",
];
const SYNONYMS = ["voucher", "kill switch", "kill-switch", "disposable card", "burner", "spending pot", "budget envelope"];
const RANGES: readonly (readonly [RegExp, number, string])[] = [
  [/\bR(\d{1,3})\b/g, 12, "R"], [/\bI(\d{1,3})\b/g, 8, "I"], [/\bS(\d{1,3})\b/g, 6, "S"], [/\bD(\d{1,3})\b/g, 13, "D"],
  [/\bDM(\d{1,3})\b/g, 9, "DM"], [/\bE(\d{1,3})\b/g, 5, "E"], [/\bSR(\d{1,3})\b/g, 4, "SR"], [/\bDIR(\d{1,3})\b/g, 11, "DIR"], [/\bU(\d{1,3})\b/g, 4, "U"],
];

const registerIds = (): Set<string> =>
  new Set([...readFileSync(REGISTER, "utf8").matchAll(/^\|\s*(F\d+[a-z]?)\s*\|/gm)].map((m) => m[1] ?? ""));

const stripFences = (text: string): string => text.replace(/```.*?```/gs, "");

export function docsLint(markdown: string): string[] {
  const problems: string[] = [];
  const body = stripFences(markdown);
  const ids = registerIds();
  for (const m of markdown.matchAll(/\bF(\d+[a-z]?)(?:\.\w+)?\b/g)) if (!ids.has(`F${m[1]}`)) problems.push(`unknown register id F${m[1]}`);
  if (markdown.includes("—")) problems.push("em dash");
  if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(markdown.replace(/[✓→⇒]/g, ""))) problems.push("emoji or pictograph");
  const low = markdown.toLowerCase();
  for (const w of BANNED) if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(low)) problems.push(`banned word: ${w}`);
  for (const w of SYNONYMS) if (low.includes(w)) problems.push(`synonym: ${w}`);
  for (const [pattern, max, name] of RANGES) {
    for (const m of body.matchAll(pattern)) if (Number(m[1]) > max || Number(m[1]) === 0) problems.push(`id out of range: ${name}${m[1]}`);
  }
  for (const line of body.split("\n")) {
    if (/HK\$\s?[\d,]+(?:\.\d+)?[mk]?|\b\d[\d,]*(?:\.\d+)?\s?%|\b\d[\d,]*\s?ms\b|\$\d[\d.,]*/.test(line) && !/\bF\d+[a-z]?\b/.test(line)) {
      problems.push(`number without a register id: ${line.trim().slice(0, 90)}`);
    }
  }
  for (const m of body.matchAll(/(?<![\w.])(?:\d[ -]?){13,19}(?![\w])/g)) problems.push(`PAN-like run: ${m[0].slice(0, 20)}`);
  if (/cvv\D{0,12}\d{3}/.test(low)) problems.push("cvv followed by digits");
  if (/sk-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{8,}|-----BEGIN/.test(markdown)) problems.push("key-like string");
  const lines = markdown.split("\n");
  let inFence = false;
  lines.forEach((ln, i) => {
    if (ln.trim().startsWith("```")) inFence = !inFence;
    if (inFence || !/^#{1,4} /.test(ln)) return;
    const next = lines.slice(i + 1).find((l) => l.trim() !== "");
    if (next !== undefined && /^[A-Za-z"'(]/.test(next) && next.length > 90) problems.push(`prose under heading: ${ln.slice(0, 40)}`);
  });
  return problems;
}
