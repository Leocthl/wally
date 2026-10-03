// Static parts of the page: one field per input (label, textarea, file picker, source line, error line) and the
// action buttons. Built once per layout; app.ts updates their values and states. The words come from the Copy of the
// display mode in force; the structure is the same in both modes.
import type { Action, Copy } from "../copy";
import { bi, el } from "../dom";
import type { Field } from "../inputs";

export type { Action } from "../copy";

export interface FieldParts {
  readonly field: Field;
  readonly root: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  readonly file: HTMLInputElement;
  readonly source: HTMLElement;
  readonly error: HTMLElement;
}

const ROWS: Readonly<Record<Field, string>> = { log: "6", keys: "4", checkpoint: "3" };

const ACCEPT = ".jsonl,.json,.txt,application/json,text/plain";

export function buildField(field: Field, copy: Copy): FieldParts {
  const words = copy.fields[field];
  const id = (part: string): string => `${field}-${part}`;
  const textarea = el("textarea", {
    id: id("text"),
    rows: ROWS[field],
    spellcheck: "false",
    autocomplete: "off",
    autocapitalize: "off",
    wrap: "off",
    "aria-describedby": `${id("source")} ${id("error")}`,
  });
  // The native input sits invisibly on top of its label, so the label is the pill you see and tap, in the page's
  // language, and the real control keeps its keyboard focus and its 44px target. The label follows the input so
  // :focus-visible on the input can draw the ring on the pill.
  const file = el("input", { type: "file", id: id("file"), accept: ACCEPT, class: "file__input", "aria-describedby": `${id("source")} ${id("error")}` });
  const source = el("p", { id: id("source"), class: "field__source soft" });
  const error = el("p", { id: id("error"), class: "field__error", hidden: "" });
  const root = el("div", { class: "field", "data-field": field }, [
    el("label", { for: id("text"), class: "field__label" }, [bi(words.label)]),
    textarea,
    el("div", { class: "field__meta" }, [
      el("span", { class: "file" }, [file, el("label", { for: id("file"), class: "file__label" }, [bi(words.fileLabel)])]),
      source,
    ]),
    error,
  ]);
  return { field, root, textarea, file, source, error };
}

/** Verify is the one filled button; Load demo log is outlined, Tamper is the danger outline, Restore is quiet. */
const LOOK: Readonly<Record<Action, string>> = { verify: "btn--primary", demo: "btn--secondary", tamper: "btn--danger", restore: "btn--ghost" };

export function buildButton(action: Action, copy: Copy): HTMLButtonElement {
  return el("button", { type: "button", class: `btn ${LOOK[action]}`, "data-action": action }, [bi(copy.buttons[action])]);
}
