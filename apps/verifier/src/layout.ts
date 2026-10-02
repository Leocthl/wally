// Page skeleton in the Wally look (cool ground, white cards, pill buttons): the header (shield mark and SIMULATED chip,
// then the title with the EN | 繁 toggle beside it), the run column (actions, verdict, Tamper note, entries), the inputs
// card and the footer. Mobile first: one column, so on a phone Verify, the verdict and the first entries share one
// screen and the three text areas sit below; two columns from 960px (CSS). DOM order is the visual order at every width.
import { bi, el } from "./dom";
import { icon } from "./icons";
import type { Field } from "./inputs";
import { buildButton, buildField, type Action, type FieldParts } from "./render/form";
import { buildLangToggle } from "./render/lang-toggle";
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
  const mark = el("span", { class: "top__mark", "aria-hidden": "true" }, [icon("pass", 22)]);
  return el("header", { class: "top" }, [
    el("div", { class: "top__bar" }, [mark, el("span", { class: "top__brand" }, ["Wally"]), el("p", { class: "chip chip--sim top__chip" }, [bi(S.railSimulated)])]),
    el("div", { class: "top__titlebar" }, [el("h1", { class: "top__title" }, [bi(S.title)]), buildLangToggle()]),
    bi(S.intro, "p", "top__intro"),
  ]);
}

function footer(): HTMLElement {
  return el("footer", { class: "foot" }, [bi(S.footer, "p")]);
}

export function buildLayout(root: HTMLElement): Layout {
  const fields = { log: buildField("log"), keys: buildField("keys"), checkpoint: buildField("checkpoint") };
  const buttons = { demo: buildButton("demo"), verify: buildButton("verify"), tamper: buildButton("tamper"), restore: buildButton("restore") };
  const notice = el("p", { class: "notice", role: "status", "aria-live": "polite" });
  const demoBadge = el("p", { class: "demo-badge", hidden: "" }, [bi(S.demoBadge)]);
  const result = el("div", { class: "result", id: "result", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const tamperNote = el("div", { class: "tamper-slot" });
  const timeline = el("div", { class: "timeline-slot" });
  const actions = el("div", { class: "actions", role: "group", "aria-labelledby": "actions-title" }, [
    el("span", { id: "actions-title", class: "sr-only" }, [bi(S.actions)]),
    buttons.demo,
    buttons.verify,
    buttons.tamper,
    buttons.restore,
  ]);
  const results = el("section", { class: "results", "aria-labelledby": "result-title" }, [
    el("h2", { id: "result-title" }, [bi(S.result)]),
    result,
    tamperNote,
    el("h2", { id: "timeline-title" }, [bi(S.timeline)]),
    timeline,
    bi(S.computedHere, "p", "soft computed"),
  ]);
  const inputs = el("section", { class: "panel inputs", "aria-labelledby": "inputs-title" }, [
    el("h2", { id: "inputs-title" }, [bi(S.inputsTitle)]),
    fields.log.root,
    fields.keys.root,
    fields.checkpoint.root,
  ]);
  const run = el("div", { class: "run" }, [actions, demoBadge, notice, results]);
  root.replaceChildren(header(), el("main", { class: "layout" }, [run, inputs]), footer());
  return { fields, buttons, notice, demoBadge, result, tamperNote, timeline };
}
