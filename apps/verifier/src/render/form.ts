// Static parts of the page: one field per input (label, textarea, file picker, source line, error line) and the
// action buttons. Built once; app.ts updates their values and states.
import { bi, el } from "../dom";
import type { Field } from "../inputs";
import { S, type Bi } from "../strings";

export interface FieldParts {
  readonly field: Field;
  readonly root: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  readonly file: HTMLInputElement;
  readonly source: HTMLElement;
  readonly error: HTMLElement;
}

const SPEC: Readonly<Record<Field, { readonly label: Bi; readonly fileLabel: Bi; readonly rows: string }>> = {
  log: { label: S.logLabel, fileLabel: S.fileLog, rows: "6" },
  keys: { label: S.keysLabel, fileLabel: S.fileKeys, rows: "4" },
  checkpoint: { label: S.checkpointLabel, fileLabel: S.fileCheckpoint, rows: "3" },
};

const ACCEPT = ".jsonl,.json,.txt,application/json,text/plain";

export function buildField(field: Field): FieldParts {
  const spec = SPEC[field];
  const id = (part: string): string => `${field}-${part}`;
  const textarea = el("textarea", {
    id: id("text"),
    rows: spec.rows,
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
    el("label", { for: id("text"), class: "field__label" }, [bi(spec.label)]),
    textarea,
    el("div", { class: "field__meta" }, [
      el("span", { class: "file" }, [file, el("label", { for: id("file"), class: "file__label" }, [bi(spec.fileLabel)])]),
      source,
    ]),
    error,
  ]);
  return { field, root, textarea, file, source, error };
}

export type Action = "verify" | "demo" | "tamper" | "restore";

const TEXT: Readonly<Record<Action, Bi>> = { verify: S.verify, demo: S.loadDemo, tamper: S.tamper, restore: S.restore };
/** Verify is the one filled button; Load demo log is outlined, Tamper is the danger outline, Restore is quiet. */
const LOOK: Readonly<Record<Action, string>> = { verify: "btn--primary", demo: "btn--secondary", tamper: "btn--danger", restore: "btn--ghost" };

export function buildButton(action: Action): HTMLButtonElement {
  return el("button", { type: "button", class: `btn ${LOOK[action]}`, "data-action": action }, [bi(TEXT[action])]);
}
