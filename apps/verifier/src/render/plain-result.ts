// The verdict card in plain mode. The same verdict as developer mode (the card still keeps data-outcome, data-head-seq,
// data-failed-seq and data-reason), said in everyday words: PASS says the receipts are untouched; a FAIL says at which
// receipt it broke and why, in one sentence and with no code; NOT VERIFIED says which box could not be used.
// The closed "Show the details" block exists only on a PASS and a FAIL and holds only what is safe for anyone to read: on
// a PASS the four facts (receipts, log id, last-receipt fingerprint prefix, checkpoint line), on a FAIL the failure code.
// It never holds text taken from a log line or from the library: the library's detail sentence can name an entry kind
// (MANDATE_SEALED, CARD_EVENT, ...), and so can an error message, so plain mode leaves both out. They stay in developer
// mode, and the switch keeps the state, so flipping it shows them for the very same result.
// PASS only ever comes from a clean read AND an ok report, exactly as in result.ts.
import type { Checkpoint, VerifyReport } from "@wally/core/verify";
import { bi, el } from "../dom";
import type { InputError } from "../inputs";
import { LIMITS } from "../limits";
import { checkpointLine, entriesValue } from "../phrases";
import { changedAt, fieldLead, inputProblem, passBody, passLede, problemAt } from "../plain/phrases";
import { isRuleBreak, plainReason } from "../plain/reasons";
import { P } from "../plain/strings";
import type { RunResult } from "../run";
import { S, type Bi } from "../strings";
import { badge, fact } from "./result";

type Checked = Extract<RunResult, { kind: "checked" }>;
type Failed = Extract<VerifyReport, { ok: false }>;

/** The one closed block of facts. Its summary is a 44px target (plain.css). */
function more(children: readonly Node[]): HTMLElement {
  return el("details", { class: "more verdict__more" }, [
    el("summary", { class: "more__summary" }, [bi(P.showDetails)]),
    el("div", { class: "more__body" }, children),
  ]);
}

/**
 * Receipts cut off the end go unnoticed by a PASS unless a saved checkpoint reaches the last receipt: with none, or with one
 * that is older than the last receipt, the card says so in one line (developer mode says it in the checkpoint fact).
 */
function endNote(result: Checked, head: Checkpoint): readonly HTMLElement[] {
  if (result.checkpoint === undefined) return [bi(P.noCheckpointNote, "p", "verdict__note")];
  return result.checkpoint.seq < head.seq ? [bi(P.oldCheckpointNote, "p", "verdict__note")] : [];
}

function passed(result: Checked, head: Checkpoint): HTMLElement {
  const facts = el("dl", { class: "facts" }, [
    fact(S.factEntries, entriesValue(result.entryCount, head.seq)),
    fact(S.factLog, head.log_id, true),
    fact(S.factHead, `${head.entry_hash.slice(0, LIMITS.hashPrefix)}…`, true),
    fact(S.factCheckpoint, checkpointLine(head.seq, result.checkpoint?.seq)),
  ]);
  const note = endNote(result, head);
  return el("div", { class: "verdict verdict--pass verdict--plain", "data-outcome": "pass", "data-head-seq": String(head.seq) }, [
    badge("pass", S.pass),
    bi(passLede(result.entryCount), "p", "verdict__lede"),
    bi(passBody(result.entryCount), "p", "verdict__body"),
    ...note,
    more([facts]),
  ]);
}

interface FailWords {
  /** The big word beside the shield. */
  readonly word: Bi;
  /** What was and was not checked; null when the reason already says it all. */
  readonly tail: Bi | null;
}

/**
 * "Changed at receipt N" is only true when a receipt itself broke. A rule of the budget broken by what a receipt says is a
 * problem at that receipt, not a change. A checkpoint that does not match a list whose receipts all held (it was cut short,
 * or is for another list) is said as that, and keys that cannot be trusted mean nothing was checked.
 */
function failWords(result: Checked, report: Failed): FailWords {
  if (report.reason === "KEYS") return { word: P.nothingCheckedWord, tail: null };
  const receiptBroke = result.timeline.rows.some((row) => row.status === "broken");
  if (report.reason === "TRUNCATED" && !receiptBroke) return { word: P.checkpointWord, tail: P.checkpointTail };
  if (isRuleBreak(report.reason)) return { word: problemAt(report.failedSeq + 1), tail: report.failedSeq > 0 ? P.ruleTail : P.ruleTailFirst };
  return { word: changedAt(report.failedSeq + 1), tail: report.failedSeq > 0 ? P.failTail : P.failTailFirst };
}

/** The failure code, the one technical word a FAIL keeps. It is a fixed code of the verifier, never text from a log line. */
function codeFact(reason: Failed["reason"]): HTMLElement {
  return el("dl", { class: "facts" }, [
    el("div", { class: "fact" }, [el("dt", {}, [bi(P.factCode)]), el("dd", {}, [el("code", { class: "code" }, [reason])])]),
  ]);
}

function failed(result: Checked, report: Failed): HTMLElement {
  const { failedSeq, reason } = report;
  const { word, tail } = failWords(result, report);
  const shield = badge("fail", word);
  shield.querySelector(".verdict__word")?.classList.add("verdict__word--long");
  return el("div", { class: "verdict verdict--fail verdict--plain", "data-outcome": "fail", "data-failed-seq": String(failedSeq), "data-reason": reason }, [
    shield,
    bi(plainReason(reason), "p", "verdict__lede"),
    ...(tail === null ? [] : [bi(tail, "p", "verdict__tail soft")]),
    more([codeFact(reason)]),
  ]);
}

function notVerified(outcome: string, children: readonly Node[]): HTMLElement {
  return el("div", { class: "verdict verdict--none verdict--plain", "data-outcome": outcome }, [badge("pending", S.notVerified), ...children]);
}

/**
 * A few plain words per box that could not be used. The box's own message ("Paste the public keys JSON ...") is not here:
 * it sits under the box, in the "Check your own receipts" panel, which a new input error opens (app.ts).
 */
function inputErrors(errors: readonly InputError[]): HTMLElement {
  const items = errors.map((e) => el("li", {}, [el("strong", {}, [bi(fieldLead(e.field))]), bi(inputProblem(e.field, e.kind))]));
  return notVerified("input-error", [el("ul", { class: "verdict__list" }, items)]);
}

/** A stopped check says so in plain words only: the error's own message is developer mode's (it may quote a log line). */
function crashed(): HTMLElement {
  return notVerified("crashed", [bi(P.crashed, "p", "verdict__lede")]);
}

export function renderPlainResult(result: RunResult | null): HTMLElement {
  if (result === null) return el("div", { class: "verdict verdict--idle verdict--plain", "data-outcome": "idle" }, [badge("pending", S.notVerified), bi(P.idle, "p", "verdict__lede")]);
  if (result.kind === "input-error") return inputErrors(result.errors);
  if (result.kind === "crashed") return crashed();
  return result.report.ok ? passed(result, result.report.head) : failed(result, result.report);
}
