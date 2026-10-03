// The verdict card, rendered fresh for each result (so the entrance replays on every Verify). PASS only for a clean
// read AND an ok report; everything else is FAIL or NOT VERIFIED, by shield icon + text (never colour alone).
// Numbers shown are computed in the page.
import type { Checkpoint, VerifyReport } from "@wally/core/verify";
import { bi, el } from "../dom";
import { icon, type IconName } from "../icons";
import type { InputError } from "../inputs";
import { LIMITS } from "../limits";
import { checkpointLine, crashedLine, earlierLine, entriesValue, fieldLead } from "../phrases";
import { reasonText } from "../reasons";
import type { RunResult } from "../run";
import { brokenAt, S, type Bi } from "../strings";

type Checked = Extract<RunResult, { kind: "checked" }>;

/** The round status disc: shield-check on green, shield-alert on red, a dashed shield for NOT VERIFIED. */
function badge(name: IconName, text: Bi): HTMLElement {
  return el("p", { class: "verdict__badge" }, [el("span", { class: "verdict__disc" }, [icon(name, 30)]), bi(text, "span", "verdict__word")]);
}

/** A value that is text from the log (an id, a hash) is shown as is in both languages; a sentence is a Bi. */
function fact(label: Bi, value: Bi | string, mono = false): HTMLElement {
  return el("div", { class: "fact" }, [el("dt", {}, [bi(label)]), el("dd", mono ? { class: "mono" } : {}, [typeof value === "string" ? value : bi(value)])]);
}

function passed(result: Checked, head: Checkpoint): HTMLElement {
  const facts = el("dl", { class: "facts" }, [
    fact(S.factEntries, entriesValue(result.entryCount, head.seq)),
    fact(S.factLog, head.log_id, true),
    fact(S.factHead, `${head.entry_hash.slice(0, LIMITS.hashPrefix)}…`, true),
    fact(S.factCheckpoint, checkpointLine(head.seq, result.checkpoint?.seq)),
  ]);
  return el("div", { class: "verdict verdict--pass", "data-outcome": "pass", "data-head-seq": String(head.seq) }, [
    badge("pass", S.pass),
    bi(S.passLede, "p", "verdict__lede"),
    facts,
  ]);
}

function failed(report: Extract<VerifyReport, { ok: false }>): HTMLElement {
  const { failedSeq, reason, detail } = report;
  return el("div", { class: "verdict verdict--fail", "data-outcome": "fail", "data-failed-seq": String(failedSeq), "data-reason": reason }, [
    badge("fail", S.fail),
    bi(brokenAt(failedSeq), "p", "verdict__headline"),
    el("p", { class: "verdict__reason" }, [el("code", { class: "code" }, [reason]), " ", bi(reasonText(reason))]),
    el("p", { class: "verdict__detail" }, [bi(S.detail), el("span", { class: "mono" }, [detail])]),
    bi(earlierLine(failedSeq), "p", "soft"),
  ]);
}

function notVerified(outcome: string, lines: readonly (string | HTMLElement)[]): HTMLElement {
  const items = lines.map((line) => el("li", {}, [line]));
  return el("div", { class: "verdict verdict--none", "data-outcome": outcome }, [badge("pending", S.notVerified), el("ul", { class: "verdict__list" }, items)]);
}

function inputErrors(errors: readonly InputError[]): HTMLElement {
  return notVerified(
    "input-error",
    errors.map((e) => el("span", {}, [el("strong", {}, [bi(fieldLead(e.field))]), bi({ en: e.message, zh: e.zh })])),
  );
}

export function renderResult(result: RunResult | null): HTMLElement {
  if (result === null) return el("div", { class: "verdict verdict--idle", "data-outcome": "idle" }, [badge("pending", S.notVerified), bi(S.idle, "p", "verdict__lede")]);
  if (result.kind === "input-error") return inputErrors(result.errors);
  if (result.kind === "crashed") return notVerified("crashed", [bi(crashedLine(result.message))]);
  return result.report.ok ? passed(result, result.report.head) : failed(result.report);
}
