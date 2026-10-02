// mountVerifier: builds the page into `root`, holds the (immutable) page state and re-renders on every change.
// Files are read locally with Blob.text(); the page never makes a network request.
import type { Field } from "./inputs";
import { buildLayout, type Layout } from "./layout";
import { LIMITS } from "./limits";
import { renderResult } from "./render/result";
import { renderTamperNote } from "./render/tamper-note";
import { renderTimeline } from "./render/timeline";
import { editField, INITIAL, loadDemo, restore, tamper, verify, withNotice, type FieldState, type PageState } from "./state";

export interface VerifierPage {
  readonly state: () => PageState;
}

const FIELDS: readonly Field[] = ["log", "keys", "checkpoint"];

function sourceText(field: FieldState): string {
  const size = `${field.text.length.toLocaleString("en")} characters`;
  if (field.source === "empty") return "Empty.";
  if (field.source === "demo") return `SIMULATED demo, ${size}.`;
  if (field.source === "typed") return `Pasted or typed here, ${size}.`;
  if (field.source === "tampered") return `Tampered copy, ${size}. One byte differs from the original.`;
  return `Loaded from file ${field.source.slice("file:".length)}, ${size}.`;
}

function renderFields(layout: Layout, state: PageState): void {
  const errors = state.result?.kind === "input-error" ? state.result.errors : [];
  for (const field of FIELDS) {
    const parts = layout.fields[field];
    const value = state[field];
    if (parts.textarea.value !== value.text) parts.textarea.value = value.text;
    parts.source.textContent = sourceText(value);
    const error = errors.find((e) => e.field === field);
    parts.error.textContent = error?.message ?? "";
    parts.error.hidden = error === undefined;
    parts.textarea.setAttribute("aria-invalid", error === undefined ? "false" : "true");
  }
}

function render(layout: Layout, state: PageState): void {
  renderFields(layout, state);
  const demo = FIELDS.some((f) => state[f].source === "demo") || state.tamper?.original.source === "demo";
  layout.demoBadge.hidden = !demo;
  layout.buttons.tamper.disabled = state.tamper !== null || state.log.text.trim() === "";
  layout.buttons.restore.disabled = state.tamper === null;
  layout.notice.textContent = state.notice ?? "";
  layout.result.replaceChildren(renderResult(state.result));
  const note = renderTamperNote(state.tamper, state.log.text);
  layout.tamperNote.replaceChildren(...(note ? [note] : []));
  layout.timeline.replaceChildren(renderTimeline(state.result, state.tamper?.change ?? null));
}

async function readChosenFile(input: HTMLInputElement, field: Field): Promise<{ readonly text: string; readonly name: string } | string> {
  const file = input.files?.[0];
  if (file === undefined) return "No file chosen.";
  const cap = field === "log" ? LIMITS.logChars : LIMITS.smallChars;
  if (file.size > cap) return `The file ${file.name} is ${file.size.toLocaleString("en")} bytes; this page reads up to ${cap.toLocaleString("en")}.`;
  try {
    return { text: await file.text(), name: file.name };
  } catch {
    return `The file ${file.name} could not be read.`;
  }
}

function wire(layout: Layout, get: () => PageState, set: (next: PageState) => void): void {
  for (const field of FIELDS) {
    const parts = layout.fields[field];
    parts.textarea.addEventListener("input", () => set(editField(get(), field, parts.textarea.value, "typed")));
    parts.file.addEventListener("change", () => {
      void readChosenFile(parts.file, field).then((read) => {
        parts.file.value = "";
        set(typeof read === "string" ? withNotice(get(), read) : editField(get(), field, read.text, `file:${read.name}`));
      });
    });
  }
  layout.buttons.verify.addEventListener("click", () => set(verify(get())));
  layout.buttons.demo.addEventListener("click", () => set(loadDemo(get())));
  layout.buttons.tamper.addEventListener("click", () => set(tamper(get())));
  layout.buttons.restore.addEventListener("click", () => set(restore(get())));
}

export function mountVerifier(root: HTMLElement): VerifierPage {
  const layout = buildLayout(root);
  let current: PageState = INITIAL; // the only mutable binding; each state object is immutable
  const set = (next: PageState): void => {
    current = next;
    render(layout, current);
  };
  wire(layout, () => current, set);
  render(layout, current);
  return { state: () => current };
}
