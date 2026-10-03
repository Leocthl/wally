// Plain mode, the page's default: what a person who cannot read a hash sees. The same judge flow as page.test.ts (sample,
// check, change one receipt, put it back) but in everyday words, with every fact that was there still one tap away.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKPOINT, domTools, joinLines, KEYS, langText, LINES, LOG, mountPlain, resetMode } from "./helpers";

let root: HTMLElement;
const { q, qa, click, typeInto } = domTools(() => root);
const en = (selector: string): string => langText(q(selector), "en");
const zh = (selector: string): string => langText(q(selector), "zh-HK");
const rowsEn = (): readonly string[] => qa(".timeline .row").map((row) => langText(row, "en"));

beforeEach(() => {
  resetMode();
  root = document.createElement("div");
  document.body.replaceChildren(root);
  mountPlain(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  resetMode();
});

describe("the header and the buttons", () => {
  it("is a receipt checker, with the SIMULATED chip and an intro in everyday words", () => {
    expect(document.documentElement.dataset["mode"]).toBe("plain");
    expect(en("h1")).toBe("Receipt checker");
    expect(zh("h1")).toBe("收據檢查");
    expect(en(".top__intro")).toBe("Checks that none of Wally's receipts were changed after they were written. It works on this page alone: nothing is sent anywhere.");
    expect(zh(".top__intro")).toContain("Wally");
    expect(q(".top .chip--sim").textContent).toContain("Rail SIMULATED");
  });

  it("keeps the honesty lines exactly as they are in developer mode", () => {
    expect(q(".foot").textContent).toContain("Prototype. Demo keys are throwaway; the rail is SIMULATED.");
    click("demo");
    expect(q(".demo-badge").hasAttribute("hidden")).toBe(false);
    expect(q(".demo-badge").textContent).toContain("SIMULATED demo log and throwaway test keys, not the booth keys.");
  });

  it("keeps the data-action ids and their order, with the plain labels", () => {
    const buttons = qa<HTMLButtonElement>(".actions button");
    expect(buttons.map((b) => b.getAttribute("data-action"))).toEqual(["demo", "verify", "tamper", "restore"]);
    expect(buttons.map((b) => langText(b, "en"))).toEqual(["Try the sample receipts", "Check the receipts", "Try changing one receipt", "Put it back"]);
    expect(buttons.map((b) => langText(b, "zh-HK"))).toEqual(["試用示範收據", "檢查收據", "試改動一張收據", "還原"]);
    expect(buttons.map((b) => [...b.classList].find((c) => c.startsWith("btn--")))).toEqual(["btn--secondary", "btn--primary", "btn--danger", "btn--ghost"]);
  });

  it("puts the verdict first under the buttons and the receipts list after it", () => {
    expect([...q(".run").children].map((c) => c.className)).toEqual(["actions", "demo-badge", "notice", "results"]);
    expect(q(".results").children[1]?.id).toBe("result");
  });
});

describe("before anything is checked", () => {
  it("says what to press, in the words of the buttons", () => {
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-outcome")).toBe("idle");
    expect(langText(verdict, "en")).toContain('Not checked yet. Press "Try the sample receipts", then "Check the receipts".');
    expect(langText(verdict, "zh-HK")).toContain("試用示範收據");
    expect(q(".verdict--idle .verdict__disc svg.icon--pending")).not.toBeNull();
    expect(en(".timeline-slot")).toBe("No receipts checked yet.");
  });
});

describe("PASS", () => {
  beforeEach(() => {
    click("demo");
    click("verify");
  });

  it("keeps the badge and the PASS word, then says the receipts are untouched", () => {
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-outcome")).toBe("pass");
    expect(verdict.getAttribute("data-head-seq")).toBe("9");
    expect(q(".verdict--pass .verdict__disc svg.icon--pass")).not.toBeNull();
    expect(langText(q(".verdict__word"), "en")).toBe("PASS");
    expect(en(".verdict__lede")).toBe("All 10 receipts are untouched.");
    expect(zh(".verdict__lede")).toBe("全部 10 張收據都完好無缺。");
    expect(en(".verdict__body")).toBe("Nothing was changed, removed or moved since Wally wrote them.");
    expect(zh(".verdict__body")).toBe("自 Wally 寫下後，沒有任何收據被改動、刪走或調動。");
  });

  it("does not warn about the end of the list when a checkpoint was given", () => {
    expect(root.querySelector(".verdict__note")).toBeNull();
  });

  it("keeps all four facts, one tap away in a closed block", () => {
    const more = q<HTMLDetailsElement>(".verdict details");
    expect(more.open).toBe(false);
    expect(langText(q(".verdict summary"), "en")).toBe("Show the details");
    expect(langText(q(".verdict summary"), "zh-HK")).toBe("顯示詳情");
    const facts = qa(".verdict .facts .fact");
    expect(facts).toHaveLength(4);
    expect(more.contains(facts[0] ?? null)).toBe(true);
    const text = langText(more, "en");
    expect(text).toContain("10 (seq 0 to 9)");
    expect(text).toContain("log_demoM0");
    expect(text).toContain("c239a89c00b57f49");
    expect(text).toContain("Matches seq 9 (the head).");
    for (const fact of facts) expect([...fact.children].map((c) => c.tagName)).toEqual(["DT", "DD"]);
  });

  it("warns that a cut-off end would go unnoticed when no checkpoint was given", () => {
    typeInto("checkpoint", "");
    click("verify");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    expect(en(".verdict__note")).toBe("Receipts cut off the end would not be noticed without a saved checkpoint.");
    expect(zh(".verdict__note")).toBe("沒有已儲存的檢查點，被截走的尾部收據不會被發現。");
    expect(langText(q(".verdict details"), "en")).toContain("None given: truncation was not checked");
  });

  it("warns the same way when the saved checkpoint is older than the last receipt", () => {
    const at5 = JSON.parse(LINES[5] ?? "{}") as { entry_hash: string };
    typeInto("checkpoint", JSON.stringify({ log_id: "log_demoM0", seq: 5, entry_hash: at5.entry_hash }));
    click("verify");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    expect(en(".verdict__note")).toBe("The saved checkpoint is older than the last receipt, so receipts cut off after it would not be noticed.");
    expect(zh(".verdict__note")).toBe("已儲存的檢查點比最後一張收據舊，在它之後被刪去的收據不會被發現。");
    expect(langText(q(".verdict details"), "en")).toContain("Matches seq 5; the 4 later entries are not covered by it.");
  });

  it("says 'the receipt', not 'all 1 receipts', for a list of one", () => {
    typeInto("log", joinLines(LINES.slice(0, 1)));
    typeInto("checkpoint", "");
    click("verify");
    expect(en(".verdict__lede")).toBe("The receipt is untouched.");
    expect(en(".verdict__body")).toBe("Nothing was changed, removed or moved since Wally wrote it.");
    expect(zh(".verdict__lede")).toBe("這張收據完好無缺。");
  });
});

describe("the receipts list after PASS", () => {
  beforeEach(() => {
    click("demo");
    click("verify");
  });

  it("numbers the receipts from 1 and names each one in everyday words", () => {
    const labels = qa(".timeline .row").map((row) => [langText(row.querySelector(".row__seq") as Element, "en"), langText(row.querySelector(".row__kind") as Element, "en")]);
    expect(labels).toEqual([
      ["Receipt 1", "Budget sealed"],
      ["Receipt 2", "Approved"],
      ["Receipt 3", "One-off card made"],
      ["Receipt 4", "Charge declined"],
      ["Receipt 5", "Charged"],
      ["Receipt 6", "Stopped before paying"],
      ["Receipt 7", "Wally asked for your OK"],
      ["Receipt 8", "You said no"],
      ["Receipt 9", "You cancelled the budget"],
      ["Receipt 10", "Budget ended"],
    ]);
  });

  it("names them in Chinese too", () => {
    const first = q(".timeline .row");
    expect(langText(first, "zh-HK")).toContain("第 1 張收據");
    expect(langText(first, "zh-HK")).toContain("預算已鎖定");
    expect(langText(qa(".timeline .row")[9] as Element, "zh-HK")).toContain("第 10 張收據");
  });

  it("shows the time in Hong Kong time", () => {
    expect(en(".timeline .row .row__ts")).toBe("3 Oct 2026, 10:00");
    expect(zh(".timeline .row .row__ts")).toBe("2026年10月3日 10:00");
  });

  it("shows no raw kind, no ISO time and no seq in a row, and says untouched", () => {
    const rows = rowsEn();
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row).not.toMatch(/[A-Z]{3,}_[A-Z]+|T\d\d:\d\d|\bseq\b|\d{4}-\d\d-\d\d/);
      expect(row).toContain("untouched");
    }
    expect(qa(".timeline .row").every((row) => row.getAttribute("data-status") === "ok")).toBe(true);
    expect(qa(".timeline .row--ok .row__disc svg.icon--tick")).toHaveLength(10);
  });

  it("keeps the list semantics and the same rows hooks as developer mode", () => {
    expect(q(".timeline").getAttribute("role")).toBe("list");
    for (const row of qa(".timeline .row")) {
      expect(row.getAttribute("role")).toBe("listitem");
      expect(row.classList.contains("row--plain")).toBe(true);
    }
    expect(qa(".timeline .row").map((r) => r.getAttribute("data-index"))).toEqual(Array.from({ length: 10 }, (_, i) => String(i)));
  });

  it("says the saved checkpoint matches, in words", () => {
    const row = q(".row--checkpoint");
    expect(row.getAttribute("data-checkpoint")).toBe("ok");
    expect(langText(row, "en")).toBe("The saved checkpoint matches.");
    expect(langText(row, "zh-HK")).toBe("已儲存的檢查點相符。");
  });

  it("calls the section Receipts", () => {
    expect(en("#timeline-title")).toBe("Receipts");
    expect(zh("#timeline-title")).toBe("收據");
  });
});

describe("changing one receipt", () => {
  beforeEach(() => {
    click("demo");
    click("verify");
    click("tamper");
  });

  it("says where it broke, why, and what was and was not checked", () => {
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-outcome")).toBe("fail");
    expect(verdict.getAttribute("data-failed-seq")).toBe("1");
    expect(verdict.getAttribute("data-reason")).toBe("PAYLOAD_HASH");
    expect(q(".verdict--fail .verdict__disc svg.icon--fail")).not.toBeNull();
    expect(langText(q(".verdict__word"), "en")).toBe("Changed at receipt 2");
    expect(langText(q(".verdict__word"), "zh-HK")).toBe("第 2 張收據被改動");
    expect(en(".verdict__lede")).toBe("What this receipt says was changed after it was written.");
    expect(zh(".verdict__lede")).toBe("這張收據的內容在寫下後被改動。");
    expect(en(".verdict__tail")).toBe("Receipts before it are untouched. Receipts after it were not checked, because one change breaks the rest.");
    expect(zh(".verdict__tail")).toBe("它之前的收據完好；之後的收據不會再檢查，因為一處改動會令之後的都不可信。");
  });

  it("keeps only the failure code in the closed block: no library text, no earlier-and-after line, no entry numbers", () => {
    const more = q<HTMLDetailsElement>(".verdict details");
    expect(more.open).toBe(false);
    expect(langText(q(".verdict .more__body"), "en")).toBe("CodePAYLOAD_HASH");
    expect(langText(q(".verdict .more__body"), "zh-HK")).toBe("代碼PAYLOAD_HASH");
    expect(q(".verdict .more__body code").textContent).toBe("PAYLOAD_HASH");
    expect(langText(q(".verdict"), "en")).not.toMatch(/Detail|seq|Chain broken|Entries before|payload_hash/);
    expect(root.querySelector(".verdict__detail, .verdict__headline, .verdict__reason")).toBeNull();
  });

  it("marks the first receipt untouched, the second changed, and the rest not checked", () => {
    expect(qa(".timeline .row").map((r) => r.getAttribute("data-status"))).toEqual(["ok", "broken", ...Array.from({ length: 8 }, () => "unchecked")]);
    const rows = rowsEn();
    expect(rows[0]).toContain("untouched");
    expect(rows[1]).toContain("changed");
    expect(rows[1]).not.toContain("untouched");
    for (const row of rows.slice(2)) expect(row).toContain("not checked");
    expect(q('.row[data-index="1"] svg.icon--cross')).not.toBeNull();
    expect(qa(".timeline .row--unchecked svg.icon--ring")).toHaveLength(8);
  });

  it("tags the changed row in words", () => {
    const tag = q('.row[data-index="1"] [data-tampered]');
    expect(langText(tag, "en")).toBe("We changed this one");
    expect(langText(tag, "zh-HK")).toBe("我們改動了這一張");
    expect(tag.textContent).not.toContain("approved_limit_minor");
  });

  it("does not check the saved checkpoint after a break, and says why", () => {
    const row = q(".row--checkpoint");
    expect(row.getAttribute("data-checkpoint")).toBe("unchecked");
    expect(langText(row, "en")).toBe("The saved checkpoint was not checked, because an earlier receipt failed.");
  });

  it("explains the change in one sentence with HK$ amounts, and shows no field path, line, column or bytes", () => {
    const note = q(".tamper-note");
    expect(note.getAttribute("data-tampered")).toBe("true");
    expect(note.getAttribute("data-tampered-seq")).toBe("1");
    expect(langText(q(".tamper-note__what"), "en")).toBe(
      "We changed the approved amount on receipt 2 in a copy, from HK$259 to HK$359, and the check caught it, because each receipt is locked to the one before it. Your real receipts were not touched.",
    );
    expect(langText(q(".tamper-note__what"), "zh-HK")).toBe(
      "我們在副本中把第 2 張收據的批准金額由 HK$259 改成 HK$359，檢查即時發現，因為每張收據都與上一張鎖在一起。你真正的收據原封不動。",
    );
    expect(langText(q(".tamper-note__hint"), "en")).toBe('Press "Put it back" to restore the original.');
    const text = langText(note, "en");
    expect(text).not.toMatch(/payload|approved_limit_minor|line \d|column|byte|→|25900|35900/);
    expect(root.querySelector(".snippet")).toBeNull();
    expect(root.querySelector(".tamper-note code")).toBeNull();
  });

  it("puts the original back", () => {
    click("restore");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("pass");
    expect(en(".verdict__lede")).toBe("All 10 receipts are untouched.");
    expect(q<HTMLTextAreaElement>("#log-text").value).toBe(LOG);
    expect(root.querySelector(".tamper-note")).toBeNull();
    expect(q<HTMLButtonElement>('[data-action="restore"]').disabled).toBe(true);
  });
});

describe("what the change note claims", () => {
  const CAUGHT = "and the check caught it, because each receipt is locked to the one before it";

  it("says the check caught it when the check failed at the receipt that was changed", () => {
    click("demo");
    click("tamper");
    expect(en(".tamper-note__what")).toContain(CAUGHT);
  });

  it("makes no claim about a catch when nothing could be checked (the keys box is empty)", () => {
    click("demo");
    typeInto("keys", "");
    click("tamper");
    expect(q("[data-outcome]").getAttribute("data-outcome")).toBe("input-error");
    expect(en(".tamper-note__what")).toBe("We changed the approved amount on receipt 2 in a copy, from HK$259 to HK$359. Your real receipts were not touched.");
    expect(zh(".tamper-note__what")).toBe("我們在副本中把第 2 張收據的批准金額由 HK$259 改成 HK$359。你真正的收據原封不動。");
  });

  it("makes no claim when the list had already broken before the receipt that was changed", () => {
    typeInto("log", LOG.replace('"payload_hash":"da24a6c8', '"payload_hash":"db24a6c8'));
    typeInto("keys", KEYS);
    typeInto("checkpoint", CHECKPOINT);
    click("tamper");
    expect(q("[data-outcome]").getAttribute("data-failed-seq")).toBe("0");
    expect(en(".tamper-note__what")).not.toContain("caught");
    expect(en(".tamper-note__what")).toContain("on receipt 2");
  });

  it("leaves a time out of the sentence: a time is never quoted from the log", () => {
    typeInto("log", joinLines(LINES.slice(0, 1)));
    typeInto("keys", KEYS);
    typeInto("checkpoint", "");
    click("tamper");
    expect(q("[data-outcome]").getAttribute("data-failed-seq")).toBe("0");
    expect(en(".tamper-note__what")).toBe(`We changed the time on receipt 1 in a copy, ${CAUGHT}. Your real receipts were not touched.`);
    expect(q(".tamper-note").textContent).not.toMatch(/2026|T02:00/);
  });
});
