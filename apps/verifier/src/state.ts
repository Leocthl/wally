// Page state and its transitions, all pure: each returns a new state. Any edit of an input clears the result, so
// a PASS is never shown next to text it was not computed for. Tamper keeps the original log for Restore.
import { DEMO } from "./demo";
import type { Field } from "./inputs";
import type { Mode } from "./mode";
import { P } from "./plain/strings";
import { runVerification, type RunResult } from "./run";
import type { Bi } from "./strings";
import { tamperLog, type TamperChange } from "./tamper";

export type Source = "empty" | "demo" | "typed" | "tampered" | `file:${string}`;

/** A one-line message, worded for each display mode: the state holds both, so a mode flip needs no new state. */
export type Notice = Readonly<Record<Mode, Bi>>;

/** A message that reads the same in both modes. */
export const sameInBoth = (text: Bi): Notice => ({ developer: text, plain: text });

export interface FieldState {
  readonly text: string;
  readonly source: Source;
}

export interface TamperState {
  readonly original: FieldState;
  readonly change: TamperChange;
}

export interface PageState {
  readonly log: FieldState;
  readonly keys: FieldState;
  readonly checkpoint: FieldState;
  readonly tamper: TamperState | null;
  readonly result: RunResult | null;
  readonly notice: Notice | null;
}

const EMPTY: FieldState = { text: "", source: "empty" };

export const INITIAL: PageState = Object.freeze({ log: EMPTY, keys: EMPTY, checkpoint: EMPTY, tamper: null, result: null, notice: null });

const check = (state: PageState): RunResult =>
  runVerification({ log: state.log.text, keys: state.keys.text, checkpoint: state.checkpoint.text });

/** A typed, pasted or loaded value: becomes the new original (an edited tampered copy is the user's own text). */
export function editField(state: PageState, field: Field, text: string, source: Source): PageState {
  const tamper = field === "log" ? null : state.tamper;
  return { ...state, [field]: { text, source }, tamper, result: null, notice: null };
}

export function loadDemo(state: PageState): PageState {
  const demo = (text: string): FieldState => ({ text, source: "demo" });
  return { ...state, log: demo(DEMO.log), keys: demo(DEMO.keys), checkpoint: demo(DEMO.checkpoint), tamper: null, result: null, notice: null };
}

export function verify(state: PageState): PageState {
  return { ...state, result: check(state), notice: null };
}

/** Flip one byte of a copy and re-verify; a second Tamper before Restore does nothing. */
export function tamper(state: PageState): PageState {
  if (state.tamper !== null) return state;
  const tampered = tamperLog(state.log.text);
  if (!tampered.ok) return { ...state, notice: { developer: { en: tampered.message, zh: tampered.messageZh }, plain: P.nothingToChange } };
  const next: PageState = { ...state, log: { text: tampered.text, source: "tampered" }, tamper: { original: state.log, change: tampered.change } };
  return { ...next, result: check(next), notice: null };
}

export function restore(state: PageState): PageState {
  if (state.tamper === null) return state;
  const next: PageState = { ...state, log: state.tamper.original, tamper: null };
  return { ...next, result: check(next), notice: null };
}

export function withNotice(state: PageState, notice: Notice): PageState {
  return { ...state, notice };
}
