// Voice input for the Ask field. The person presses the mic and speaks; the words reach the field while they are said
// (interim, then final) and the person presses Send themselves: nothing in here ever sends. The field stays editable:
// typing while the mic listens ends the session and the typing wins. One session per press, dropped when the field goes
// away (the Ask sheet unmounts its field when it closes). The listening itself is in session.ts, the states in voiceState.ts.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useLocale, type Locale } from "../../ui/locale";
import { isVoiceSupported } from "./recognizer";
import { startSession, type VoiceSession } from "./session";
import { INITIAL_VOICE, reduceVoice, type VoiceStatus } from "./voiceState";

/** localStorage key that remembers the first-use note has been shown. */
export const VOICE_NOTE_KEY = "wally:voice-note";

/** The recogniser listens in the language the EN | 繁 toggle is on. */
export const RECOGNITION_LANG: Readonly<Record<Locale, string>> = { en: "en-US", "zh-HK": "zh-HK" };

export interface VoiceInputOptions {
  /** What the field holds now. Spoken words are added after it. */
  readonly value: string;
  /** Receives the field's new text while the person speaks. It only fills the field. */
  readonly onText: (next: string) => void;
  /** The field's character cap: spoken words stop there. */
  readonly maxLength?: number;
}

export interface VoiceInput {
  /** False where the page has no speech API and in the native shell: the mic is not drawn at all. */
  readonly supported: boolean;
  readonly status: VoiceStatus;
  /** The first-use note is showing. */
  readonly note: boolean;
  /** The mic button: stops when listening; else shows the note on the very first press; else starts listening. */
  readonly toggle: () => void;
}

function noteWasShown(): boolean {
  try {
    return window.localStorage.getItem(VOICE_NOTE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberNote(): void {
  try {
    window.localStorage.setItem(VOICE_NOTE_KEY, "1");
  } catch {
    // Storage blocked: the note shows once more next visit.
  }
}

export function useVoiceInput({ value, onText, maxLength }: VoiceInputOptions): VoiceInput {
  const { locale } = useLocale();
  const [supported] = useState(() => isVoiceSupported());
  const [state, dispatch] = useReducer(reduceVoice, INITIAL_VOICE);
  const session = useRef<VoiceSession | null>(null);
  const noteShown = useRef<boolean | null>(null);
  const latest = useRef({ value, onText, maxLength, lang: RECOGNITION_LANG[locale] });
  useEffect(() => {
    latest.current = { value, onText, maxLength, lang: RECOGNITION_LANG[locale] };
  });

  /** Ends the session for good: not another word or event from it. `report` also puts the state back to rest. */
  const drop = useCallback((report: boolean): void => {
    session.current?.drop();
    session.current = null;
    if (report) dispatch({ type: "idle" });
  }, []);

  // The field goes away (the sheet closed): stop listening.
  useEffect(() => () => drop(false), [drop]);

  // The person typed while the mic listened: the typing wins. A text this session wrote itself is not typing, even when
  // React renders it late; so the check is against everything the session wrote, not just the last text.
  useEffect(() => {
    if (session.current?.live() && !session.current.owns(value)) drop(true);
  }, [value, drop]);

  const begin = useCallback((): void => {
    drop(false);
    const { value: typed, maxLength: max, lang } = latest.current;
    session.current = startSession({ lang, typed, maxLength: max, write: (next) => latest.current.onText(next), report: dispatch }) ?? null;
  }, [drop]);

  const toggle = useCallback((): void => {
    if (session.current?.listening()) {
      session.current.stop();
      return;
    }
    if ((noteShown.current ??= noteWasShown())) {
      begin();
      return;
    }
    // First use: say where the audio goes before anything listens. Pressing the mic again is the yes.
    noteShown.current = true;
    rememberNote();
    dispatch({ type: "note" });
  }, [begin]);

  return { supported, status: state.status, note: state.note, toggle };
}
