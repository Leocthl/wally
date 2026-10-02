// Page skeleton in the LEDGER register (docs/04): header, the three inputs with the actions, the result panel,
// the Tamper note and the entry timeline, and the footer. Mobile first: one column, two from 960px (CSS).
import { bi, el } from "./dom";
import type { Field } from "./inputs";
import { buildButton, buildField, type Action, type FieldParts } from "./render/form";
import { S } from "./strings";

export interface Layout {
  readonly fields: Readonly<Record<Field, FieldParts>>;
  readonly buttons: Readonly<Record<Action, HTMLButtonElement>>;
  readonly notice: HTMLElement;
  readonly demoBadge: HTMLElement;
  readonly result: HTMLElement;
  readonly tamperNote: HTMLElement;
  readonly timeline: HTMLElement;
}

function header(): HTMLElement {
  return el("header", { class: "top" }, [
    el("h1", {}, [bi(S.title)]),
    bi(S.intro, "p", "top__intro"),
    el("p", { class: "chip chip--sim" }, ["Rail SIMULATED"]),
  ]);
}

function footer(): HTMLElement {
  return el("footer", { class: "foot" }, [bi(S.footer, "p")]);
}

export function buildLayout(root: HTMLElement): Layout {
  const fields = { log: buildField("log"), keys: buildField("keys"), checkpoint: buildField("checkpoint") };
  const buttons = { verify: buildButton("verify"), demo: buildButton("demo"), tamper: buildButton("tamper"), restore: buildButton("restore") };
  const notice = el("p", { class: "notice", role: "status", "aria-live": "polite" });
  const demoBadge = el("p", { class: "chip chip--sim demo-badge", hidden: "" }, [bi(S.demoBadge)]);
  const result = el("div", { class: "result", id: "result", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const tamperNote = el("div", { class: "tamper-slot" });
  const timeline = el("div", { class: "timeline-slot" });
  const inputs = el("section", { class: "panel inputs", "aria-labelledby": "inputs-title" }, [
    el("h2", { id: "inputs-title", class: "sr-only" }, ["Inputs"]),
    demoBadge,
    fields.log.root,
    fields.keys.root,
    fields.checkpoint.root,
    el("div", { class: "actions", role: "group", "aria-label": "Actions" }, [buttons.verify, buttons.demo, buttons.tamper, buttons.restore]),
    notice,
  ]);
  const results = el("section", { class: "panel results", "aria-labelledby": "result-title" }, [
    el("h2", { id: "result-title" }, [bi(S.result)]),
    result,
    tamperNote,
    el("h2", { id: "timeline-title" }, [bi(S.timeline)]),
    timeline,
    bi(S.computedHere, "p", "soft computed"),
  ]);
  root.replaceChildren(header(), el("main", { class: "layout" }, [inputs, results]), footer());
  return { fields, buttons, notice, demoBadge, result, tamperNote, timeline };
}
