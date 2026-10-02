// JSONL text -> entries for verifyChain. Every line must be the exact JCS spelling of its JSON, so a
// changed byte can never parse to the same entry (CRLF, spaces, escapes, 1.0 for 1). Bad lines keep their
// index and fail SCHEMA there; only one final '\n' is optional. A line longer than the log's line limit is
// refused before it is parsed, so one huge line cannot stall the verifier.
import { jcs } from "../crypto/jcs";
import { lineProblem as tooLong } from "../log/limits";
import type { Checkpoint } from "../ports";
import { verifyChain } from "./chain";
import type { PublicKeys, VerifyReport } from "./report";

export interface ParsedLog {
  /** Parsed lines; a bad line is kept as its raw text so verifyChain fails SCHEMA at that index. */
  readonly entries: readonly unknown[];
  /** Line index -> why it is not a canonical JSON line. */
  readonly badLines: ReadonlyMap<number, string>;
}

function lineProblem(line: string): { readonly value: unknown; readonly problem: string | null } {
  if (line === "") return { value: line, problem: "empty line" };
  const long = tooLong(line);
  if (long !== null) return { value: "", problem: long };
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { value: line, problem: "line is not JSON" };
  }
  let canonical: string;
  try {
    canonical = jcs(value);
  } catch {
    return { value: line, problem: "line has no canonical JSON form" };
  }
  return canonical === line ? { value, problem: null } : { value: line, problem: "line is not canonical JSON (RFC 8785 JCS)" };
}

export function parseLogText(text: string): ParsedLog {
  const lines = text.split("\n");
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  const parsed = lines.map(lineProblem);
  const badLines = new Map(parsed.flatMap((p, i) => (p.problem === null ? [] : [[i, p.problem] as const])));
  return { entries: parsed.map((p) => p.value), badLines };
}

/** verifyChain over exported JSONL text (verify-log CLI, verifier page). */
export function verifyLogText(text: string, publicKeys: PublicKeys, headCheckpoint?: Checkpoint): VerifyReport {
  if (text === "") return verifyChain([], publicKeys, headCheckpoint);
  const { entries, badLines } = parseLogText(text);
  const report = verifyChain(entries, publicKeys, headCheckpoint);
  if (report.ok || report.reason !== "SCHEMA") return report;
  const problem = badLines.get(report.failedSeq);
  return problem === undefined ? report : { ...report, detail: problem };
}
