// mountVerifier: builds the page into `root`, holds the (immutable) page state and re-renders on every change.
// Files are read locally with Blob.text(); the page never makes a network request.
import { bi } from "./dom";
import type { Field } from "./inputs";
import { applyLang, initialLang } from "./lang";
import { buildLayout, type Layout } from "./layout";
import { LIMITS } from "./limits";
import { fileTooBig, fileUnreadable, sourceLine } from "./phrases";
import { renderResult } from "./render/result";
import { renderTamperNote } from "./render/tamper-note";
import { renderTimeline } from "./render/timeline";
import { editField, INITIAL, loadDemo, restore, tamper, verify, withNotice, type PageState } from "./state";
import { S, type Bi } from "./strings";

export interface VerifierPage {
  readonly state: () => PageState;
}

const FIELDS: readonly Field[] = ["log", "keys", "checkpoint"];

function renderFields(layout: Layout, state: PageState): void {
  const errors = state.result?.kind === "input-error" ? state.result.errors : [];
  for (const field of FIELDS) {
    const parts = layout.fields[field];
    const value = state[field];
    if (parts.textarea.value !== value.text) parts.textarea.value = value.text;
    parts.source.replaceChildren(bi(sourceLine(value.source, value.text.length)));
    const error = errors.find((e) => e.field === field);
    parts.error.replaceChildren(...(error === undefined ? [] : [bi({ en: error.message, zh: error.zh })]));
    parts.error.hidden = error === undefined;
    parts.textarea.setAttribute("aria-invalid", error === undefined ? "false" : "true");
  }
}

/**
 * The verdict, the Tamper note and the entries are rebuilt only when the result or the tamper changed, never on typing
 * or on a notice: a new element is what plays the entrance, so a Verify press replays it (even with the same inputs,
 * because every run is a new result object) and nothing else does.
 */
function renderRun(layout: Layout, state: PageState, previous: PageState | null): void {
  if (previous !== null && previous.result === state.result && previous.tamper === state.tamper) return;
  try {
    // Build all three first, then swap: an error while drawing never leaves an old verdict (a PASS) next to new state.
    const verdict = renderResult(state.result);
    const note = renderTamperNote(state.tamper, state.log.text);
    const entries = renderTimeline(state.result, state.tamper?.change ?? null);
    layout.result.replaceChildren(verdict);
    layout.tamperNote.replaceChildren(...(note ? [note] : []));
    layout.timeline.replaceChildren(entries);
  } catch (error) {
    layout.result.replaceChildren(renderResult({ kind: "crashed", message: error instanceof Error ? error.message : "the result could not be drawn" }));
    layout.tamperNote.replaceChildren();
    layout.timeline.replaceChildren();
  }
}

/** Tamper and Restore take turns: a button that becomes disabled while it has focus hands the focus to the other one. */
function keepFocus(layout: Layout, focused: Element | null): void {
  const { tamper, restore } = layout.buttons;
  if (focused === tamper && tamper.disabled && !restore.disabled) restore.focus();
  else if (focused === restore && restore.disabled && !tamper.disabled) tamper.focus();
}

function render(layout: Layout, state: PageState, previous: PageState | null): void {
  const focused = document.activeElement;
  renderFields(layout, state);
  const demo = FIELDS.some((f) => state[f].source === "demo") || state.tamper?.original.source === "demo";
  layout.demoBadge.hidden = !demo;
  layout.buttons.tamper.disabled = state.tamper !== null || state.log.text.trim() === "";
  layout.buttons.restore.disabled = state.tamper === null;
  keepFocus(layout, focused);
  if (previous?.notice !== state.notice) layout.notice.replaceChildren(...(state.notice === null ? [] : [bi(state.notice)]));
  renderRun(layout, state, previous);
}

async function readChosenFile(input: HTMLInputElement, field: Field): Promise<{ readonly text: string; readonly name: string } | Bi> {
  const file = input.files?.[0];
  if (file === undefined) return S.noFile;
  const cap = field === "log" ? LIMITS.logChars : LIMITS.smallChars;
  if (file.size > cap) return fileTooBig(file.name, file.size, cap);
  try {
    return { text: await file.text(), name: file.name };
  } catch {
    return fileUnreadable(file.name);
  }
}

function wire(layout: Layout, get: () => PageState, set: (next: PageState) => void): void {
  for (const field of FIELDS) {
    const parts = layout.fields[field];
    parts.textarea.addEventListener("input", () => set(editField(get(), field, parts.textarea.value, "typed")));
    parts.file.addEventListener("change", () => {
      void readChosenFile(parts.file, field).then((read) => {
        parts.file.value = "";
        set("text" in read ? editField(get(), field, read.text, `file:${read.name}`) : withNotice(get(), read));
      });
    });
  }
  layout.buttons.verify.addEventListener("click", () => set(verify(get())));
  layout.buttons.demo.addEventListener("click", () => set(loadDemo(get())));
  layout.buttons.tamper.addEventListener("click", () => set(tamper(get())));
  layout.buttons.restore.addEventListener("click", () => set(restore(get())));
}

export function mountVerifier(root: HTMLElement): VerifierPage {
  applyLang(initialLang()); // before the layout: the language toggle reads it
  const layout = buildLayout(root);
  let current: PageState = INITIAL; // the only mutable binding; each state object is immutable
  const set = (next: PageState): void => {
    const previous = current;
    current = next;
    render(layout, current, previous);
  };
  wire(layout, () => current, set);
  render(layout, current, null);
  return { state: () => current };
}
