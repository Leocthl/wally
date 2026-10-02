// The verdict panel, rendered fresh for each result. PASS only for a clean read AND an ok report; everything
// else is FAIL or NOT VERIFIED, by icon + text (never colour alone). Numbers shown are computed in the page.
import type { Checkpoint, VerifyReport } from "@laisee/core/verify";
import { bi, el } from "../dom";
import { icon, type IconName } from "../icons";
import type { InputError } from "../inputs";
import { LIMITS } from "../limits";
import { reasonText } from "../reasons";
import type { RunResult } from "../run";
import { brokenAt, S, type Bi } from "../strings";

type Checked = Extract<RunResult, { kind: "checked" }>;

const FIELD_NAMES = { log: "Log", keys: "Public keys", checkpoint: "Checkpoint" } as const;

function badge(name: IconName, text: Bi): HTMLElement {
  return el("p", { class: "verdict__badge" }, [icon(name, 28), bi(text, "span", "verdict__word")]);
}

function fact(label: string, value: string, mono = false): readonly HTMLElement[] {
  return [el("dt", {}, [label]), el("dd", mono ? { class: "mono" } : {}, [value])];
}

function checkpointLine(head: Checkpoint, checkpoint: Checkpoint | undefined): string {
  if (checkpoint === undefined) return "None given: truncation was not checked (a log cut short would still pass).";
  const later = head.seq - checkpoint.seq;
  return later > 0 ? `Matches seq ${checkpoint.seq}; the ${later} later entries are not covered by it.` : `Matches seq ${checkpoint.seq} (the head).`;
}

function passed(result: Checked, head: Checkpoint): HTMLElement {
  const facts = el("dl", { class: "facts" }, [
    ...fact("Entries", `${result.entryCount} (seq 0 to ${head.seq})`),
    ...fact("Log", head.log_id, true),
    ...fact("Head hash", `${head.entry_hash.slice(0, LIMITS.hashPrefix)}…`, true),
    ...fact("Checkpoint", checkpointLine(head, result.checkpoint)),
  ]);
  return el("div", { class: "verdict verdict--pass", "data-outcome": "pass", "data-head-seq": String(head.seq) }, [
    badge("pass", S.pass),
    bi({ en: "Chain verified: hashes, order and every signature check out.", zh: "紀錄鏈已驗證：雜湊、次序及所有簽署均正確。" }, "p"), // NEEDS-REVIEW zh-HK
    facts,
  ]);
}

function failed(report: Extract<VerifyReport, { ok: false }>): HTMLElement {
  const { failedSeq, reason, detail } = report;
  const earlier = failedSeq > 0 ? `Entries before seq ${failedSeq} verified; entries after it were not checked.` : "Nothing before this entry to trust.";
  return el("div", { class: "verdict verdict--fail", "data-outcome": "fail", "data-failed-seq": String(failedSeq), "data-reason": reason }, [
    badge("fail", S.fail),
    bi(brokenAt(failedSeq), "p", "verdict__headline"),
    el("p", { class: "verdict__reason" }, [el("code", { class: "code" }, [reason]), " ", bi(reasonText(reason))]),
    el("p", { class: "verdict__detail" }, ["Detail: ", el("span", { class: "mono" }, [detail])]),
    el("p", { class: "soft" }, [earlier]),
  ]);
}

function notVerified(outcome: string, lines: readonly (string | HTMLElement)[]): HTMLElement {
  const items = lines.map((line) => el("li", {}, [line]));
  return el("div", { class: "verdict verdict--none", "data-outcome": outcome }, [badge("pending", S.notVerified), el("ul", { class: "verdict__list" }, items)]);
}

function inputErrors(errors: readonly InputError[]): HTMLElement {
  return notVerified("input-error", errors.map((e) => el("span", {}, [el("strong", {}, [`${FIELD_NAMES[e.field]}: `]), e.message])));
}

export function renderResult(result: RunResult | null): HTMLElement {
  if (result === null) return el("div", { class: "verdict verdict--idle", "data-outcome": "idle" }, [badge("pending", S.notVerified), bi(S.idle, "p")]);
  if (result.kind === "input-error") return inputErrors(result.errors);
  if (result.kind === "crashed") {
    return notVerified("crashed", [`The verifier stopped with an error (${result.message}). Treat this log as not verified.`]);
  }
  return result.report.ok ? passed(result, result.report.head) : failed(result.report);
}
