// Page skeleton in the Wally look (cool ground, white cards, pill buttons): the header (shield mark and SIMULATED chip,
// then the title with the EN | 繁 toggle beside it, the intro and the "Show technical details" switch), the run column
// (actions, verdict, Tamper note, entries), the inputs card and the footer. Mobile first: one column, so on a phone
// Verify, the verdict and the first entries share one screen and the three text areas sit below; two columns from 960px
// (CSS). DOM order is the visual order at every width. The two display modes share this skeleton; they differ in words
// (copy.ts) and in one place of structure: plain mode folds the three text areas into a closed "Check your own receipts"
// block, because most readers never need them.
import { COPY, type Copy } from "./copy";
import { bi, el } from "./dom";
import { icon } from "./icons";
import type { Field } from "./inputs";
import type { Mode } from "./mode";
import { buildButton, buildField, type Action, type FieldParts } from "./render/form";
import { buildLangToggle } from "./render/lang-toggle";
import { buildModeSwitch } from "./render/mode-switch";
import { S } from "./strings";

export interface Layout {
  readonly fields: Readonly<Record<Field, FieldParts>>;
  readonly buttons: Readonly<Record<Action, HTMLButtonElement>>;
  readonly modeSwitch: HTMLButtonElement;
  /** The closed block that holds the three text areas in plain mode; null in developer mode, where they are always shown. */
  readonly inputsDetails: HTMLDetailsElement | null;
  readonly notice: HTMLElement;
  readonly demoBadge: HTMLElement;
  readonly result: HTMLElement;
  readonly tamperNote: HTMLElement;
  readonly timeline: HTMLElement;
}

function header(copy: Copy, modeSwitch: HTMLElement): HTMLElement {
  const mark = el("span", { class: "top__mark", "aria-hidden": "true" }, [icon("pass", 22)]);
  return el("header", { class: "top" }, [
    el("div", { class: "top__bar" }, [mark, el("span", { class: "top__brand" }, ["Wally"]), el("p", { class: "chip chip--sim top__chip" }, [bi(S.railSimulated)])]),
    el("div", { class: "top__titlebar" }, [el("h1", { class: "top__title" }, [bi(copy.title)]), buildLangToggle()]),
    bi(copy.intro, "p", "top__intro"),
    modeSwitch,
  ]);
}

function footer(): HTMLElement {
  return el("footer", { class: "foot" }, [bi(S.footer, "p")]);
}

interface InputsBlock {
  readonly section: HTMLElement;
  readonly details: HTMLDetailsElement | null;
}

function developerInputs(copy: Copy, fields: Readonly<Record<Field, FieldParts>>): InputsBlock {
  const section = el("section", { class: "panel inputs", "aria-labelledby": "inputs-title" }, [
    el("h2", { id: "inputs-title" }, [bi(copy.inputsTitle)]),
    fields.log.root,
    fields.keys.root,
    fields.checkpoint.root,
  ]);
  return { section, details: null };
}

/** The summary is the section's name and a 44px target; the text areas are in the body, out of the way until asked for. */
function plainInputs(copy: Copy, fields: Readonly<Record<Field, FieldParts>>): InputsBlock {
  const summary = el("summary", { id: "inputs-title", class: "more__summary" }, [bi(copy.inputsTitle)]);
  const body = el("div", { class: "more__body" }, [fields.log.root, fields.keys.root, fields.checkpoint.root]);
  const details = el("details", { class: "more inputs__more" }, [summary, body]);
  return { section: el("section", { class: "panel inputs inputs--plain", "aria-labelledby": "inputs-title" }, [details]), details };
}

export function buildLayout(root: HTMLElement, mode: Mode): Layout {
  const copy = COPY[mode];
  const fields = { log: buildField("log", copy), keys: buildField("keys", copy), checkpoint: buildField("checkpoint", copy) };
  const buttons = {
    demo: buildButton("demo", copy),
    verify: buildButton("verify", copy),
    tamper: buildButton("tamper", copy),
    restore: buildButton("restore", copy),
  };
  const modeSwitch = buildModeSwitch(mode);
  const notice = el("p", { class: "notice", role: "status", "aria-live": "polite" });
  const demoBadge = el("p", { class: "demo-badge", hidden: "" }, [bi(S.demoBadge)]);
  // Plain mode's card holds a "Show the details" block: with aria-atomic a screen reader would read the whole card again
  // whenever it is opened, so plain mode lets it announce just what was added. Developer mode is as it always was.
  const result = el("div", { class: "result", id: "result", role: "status", "aria-live": "polite", "aria-atomic": mode === "plain" ? "false" : "true" });
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
    el("h2", { id: "timeline-title" }, [bi(copy.timelineTitle)]),
    timeline,
    bi(copy.computedHere, "p", "soft computed"),
  ]);
  const inputs = mode === "plain" ? plainInputs(copy, fields) : developerInputs(copy, fields);
  const run = el("div", { class: "run" }, [actions, demoBadge, notice, results]);
  root.replaceChildren(header(copy, modeSwitch.root), el("main", { class: "layout" }, [run, inputs.section]), footer());
  return { fields, buttons, modeSwitch: modeSwitch.button, inputsDetails: inputs.details, notice, demoBadge, result, tamperNote, timeline };
}
