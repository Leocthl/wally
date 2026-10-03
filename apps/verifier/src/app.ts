// mountVerifier: builds the page into `root`, holds the (immutable) page state and re-renders on every change.
// Files are read locally with Blob.text(); the page never makes a network request.
// Two display modes (mode.ts): plain, the default, and developer. The switch rebuilds the page from the state it already
// holds, in the other mode, so the texts, the verdict, the change and the notice all stay; nothing is recomputed.
import { bi } from "./dom";
import type { Field } from "./inputs";
import { applyLang, initialLang } from "./lang";
import { buildLayout, type Layout } from "./layout";
import { LIMITS } from "./limits";
import { applyMode, chooseMode, currentMode, initialMode, type Mode } from "./mode";
import { fileTooBig, fileUnreadable, sourceLine } from "./phrases";
import { plainFileTooBig, plainSourceLine } from "./plain/phrases";
import { VIEWS } from "./render/views";
import { editField, INITIAL, loadDemo, restore, sameInBoth, tamper, verify, withNotice, type Notice, type PageState } from "./state";
import { S } from "./strings";

export interface VerifierPage {
  readonly state: () => PageState;
}

const FIELDS: readonly Field[] = ["log", "keys", "checkpoint"];
const QUIET = "data-quiet";

function renderFields(layout: Layout, state: PageState, mode: Mode): void {
  const errors = state.result?.kind === "input-error" ? state.result.errors : [];
  for (const field of FIELDS) {
    const parts = layout.fields[field];
    const value = state[field];
    if (parts.textarea.value !== value.text) parts.textarea.value = value.text;
    const where = mode === "plain" ? plainSourceLine(field, value.source, value.text) : sourceLine(value.source, value.text.length);
    parts.source.replaceChildren(bi(where));
    const error = errors.find((e) => e.field === field);
    parts.error.replaceChildren(...(error === undefined ? [] : [bi({ en: error.message, zh: error.zh })]));
    parts.error.hidden = error === undefined;
    parts.textarea.setAttribute("aria-invalid", error === undefined ? "false" : "true");
  }
}

/** A mode flip rebuilds the page, but nothing happened on it: the new parts are marked so motion.css keeps them still. */
function hush(nodes: readonly (HTMLElement | null)[], quiet: boolean): void {
  if (!quiet) return;
  for (const node of nodes) node?.setAttribute(QUIET, "");
}

/**
 * The verdict, the Tamper note and the entries are rebuilt only when the result or the tamper changed, never on typing
 * or on a notice: a new element is what plays the entrance, so a Verify press replays it (even with the same inputs,
 * because every run is a new result object) and nothing else does. `quiet` is a mode flip: the new elements stay still.
 */
function renderRun(layout: Layout, state: PageState, previous: PageState | null, mode: Mode, quiet: boolean): void {
  if (previous !== null && previous.result === state.result && previous.tamper === state.tamper) return;
  const views = VIEWS[mode];
  try {
    // Build all three first, then swap: an error while drawing never leaves an old verdict (a PASS) next to new state.
    const verdict = views.result(state.result);
    const note = views.note(state.tamper, state.log.text, state.result);
    const entries = views.timeline(state.result, state.tamper?.change ?? null);
    hush([verdict, note, entries], quiet);
    layout.result.replaceChildren(verdict);
    layout.tamperNote.replaceChildren(...(note ? [note] : []));
    layout.timeline.replaceChildren(entries);
  } catch (error) {
    const stopped = views.result({ kind: "crashed", message: error instanceof Error ? error.message : "the result could not be drawn" });
    hush([stopped], quiet);
    layout.result.replaceChildren(stopped);
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

/** A new input error opens the plain mode's folded box panel, once: closing it again is the reader's choice. */
function openForErrors(layout: Layout, state: PageState, previous: PageState | null): void {
  if (layout.inputsDetails !== null && state.result?.kind === "input-error" && state.result !== previous?.result) layout.inputsDetails.open = true;
}

function render(layout: Layout, mode: Mode, state: PageState, previous: PageState | null, quiet = false): void {
  const focused = document.activeElement;
  renderFields(layout, state, mode);
  openForErrors(layout, state, previous);
  const demo = FIELDS.some((f) => state[f].source === "demo") || state.tamper?.original.source === "demo";
  layout.demoBadge.hidden = !demo;
  // A sentence that stays on screen must not be told to move again when the mark comes off, so only a hidden one is cleared.
  if (!demo) layout.demoBadge.removeAttribute(QUIET);
  else hush([layout.demoBadge], quiet);
  layout.buttons.tamper.disabled = state.tamper !== null || state.log.text.trim() === "";
  layout.buttons.restore.disabled = state.tamper === null;
  keepFocus(layout, focused);
  if (previous?.notice !== state.notice) layout.notice.replaceChildren(...(state.notice === null ? [] : [bi(state.notice[mode])]));
  renderRun(layout, state, previous, mode, quiet);
}

async function readChosenFile(input: HTMLInputElement, field: Field): Promise<{ readonly text: string; readonly name: string } | Notice> {
  const file = input.files?.[0];
  if (file === undefined) return sameInBoth(S.noFile);
  const cap = field === "log" ? LIMITS.logChars : LIMITS.smallChars;
  if (file.size > cap) return { developer: fileTooBig(file.name, file.size, cap), plain: plainFileTooBig(file.name, cap) };
  try {
    return { text: await file.text(), name: file.name };
  } catch {
    return sameInBoth(fileUnreadable(file.name));
  }
}

function wire(layout: Layout, get: () => PageState, set: (next: PageState) => void, flipMode: () => void): void {
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
  layout.modeSwitch.addEventListener("click", flipMode);
}

export function mountVerifier(root: HTMLElement): VerifierPage {
  applyLang(initialLang()); // before the layout: the language toggle reads it
  applyMode(initialMode()); // before the layout: the words and the switch follow it
  let current: PageState = INITIAL; // each state object is immutable; this binding and `layout` are the only mutable ones
  let layout = buildLayout(root, currentMode());
  const set = (next: PageState): void => {
    const previous = current;
    current = next;
    render(layout, currentMode(), current, previous);
  };
  const flipMode = (): void => {
    chooseMode(currentMode() === "plain" ? "developer" : "plain");
    layout = buildLayout(root, currentMode());
    wire(layout, () => current, set, flipMode);
    render(layout, currentMode(), current, null, true);
    layout.modeSwitch.focus(); // the switch that was pressed is gone; the keyboard stays where it was
  };
  wire(layout, () => current, set, flipMode);
  render(layout, currentMode(), current, null);
  return { state: () => current };
}
