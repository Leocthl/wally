// Speech recognition behind a small typed controller (the Web Speech API, feature-detected). No React in here.
// A page without the API gets no recogniser, and neither does the Capacitor native shell (its web views have no working
// one), so the mic is simply not drawn there. The browser's own speech service hears the audio (first-use note).
import { isNative, type CapacitorWindow } from "../../pwa/native";

/** Why a session gave no words. "aborted" is no fault: we ended it, or the browser took the microphone away. */
export type VoiceFailure = "noSpeech" | "denied" | "offline" | "error" | "aborted";

export interface RecognizerHandlers {
  /** The words heard so far this session (never empty). They may still change. */
  readonly onInterim: (text: string) => void;
  /** The words of this session, settled (never empty). */
  readonly onFinal: (text: string) => void;
  readonly onError: (failure: VoiceFailure) => void;
  /** The session is over, after an error too. Nothing is delivered after it. */
  readonly onEnd: () => void;
}

export interface Recognizer {
  start(): void;
  /** Finish: the browser hands over what it has heard so far, then ends the session. */
  stop(): void;
  /** Drop the session: no callback of any kind fires afterwards. */
  abort(): void;
}

export interface RecognizerOptions {
  /** BCP 47 tag the recogniser listens for, e.g. "en-US" or "zh-HK". */
  readonly lang: string;
}

/** The result lists as the browser shapes them, read defensively: a field that is missing or not a string is skipped. */
interface RawResult {
  readonly isFinal?: boolean;
  readonly [index: number]: { readonly transcript?: unknown } | undefined;
}
interface RawResultEvent {
  readonly results?: ArrayLike<RawResult | undefined>;
}
interface RawErrorEvent {
  readonly error?: unknown;
}

/** The slice of SpeechRecognition used here (lib.dom has its events but not the interface itself). */
interface NativeRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RawResultEvent) => void) | null;
  onerror: ((event: RawErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type NativeConstructor = new () => NativeRecognition;

/** What this file reads from the window, so tests can pass a fake. Safari and Chrome ship the prefixed name. */
export interface VoiceWindow extends CapacitorWindow {
  readonly SpeechRecognition?: unknown;
  readonly webkitSpeechRecognition?: unknown;
}

function browserWindow(): VoiceWindow | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function constructorOf(win: VoiceWindow | undefined): NativeConstructor | undefined {
  try {
    for (const candidate of [win?.SpeechRecognition, win?.webkitSpeechRecognition]) {
      if (typeof candidate === "function") return candidate as NativeConstructor;
    }
  } catch {
    // A page that hides the API behind a getter that throws has no recogniser.
  }
  return undefined;
}

/** True when this page can listen: the API is there and we are not inside the native shell. Safe without a window. */
export function isVoiceSupported(win: VoiceWindow | undefined = browserWindow()): boolean {
  return !isNative(win) && constructorOf(win) !== undefined;
}

/** SpeechRecognition error codes onto the few outcomes the person is told about. */
export function failureOf(code: unknown): VoiceFailure {
  switch (code) {
    case "no-speech":
      return "noSpeech";
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "network":
      return "offline";
    case "aborted":
      return "aborted";
    default:
      // audio-capture, language-not-supported, phrases-not-supported, bad-grammar, or a code that does not exist yet.
      return "error";
  }
}

/** Everything heard this session as one line (Chrome keeps one entry per phrase), and whether all of it is settled. */
function transcriptOf(event: RawResultEvent): { readonly text: string; readonly final: boolean } {
  const list = event.results;
  let text = "";
  let final = true;
  for (let i = 0; list !== undefined && i < list.length; i += 1) {
    const result = list[i];
    const words = result?.[0]?.transcript;
    if (typeof words !== "string") continue;
    text += words;
    final = final && result?.isFinal === true;
  }
  return { text: text.replace(/\s+/g, " ").trim(), final };
}

/** Hands the browser's events to the handlers until detached. After detach (or the end event) nothing more gets through. */
function listenTo(native: NativeRecognition, handlers: RecognizerHandlers): { readonly live: () => boolean; readonly detach: () => void } {
  let live = true;
  const detach = (): void => {
    live = false;
    native.onresult = null;
    native.onerror = null;
    native.onend = null;
  };
  native.onresult = (event) => {
    if (!live) return;
    const heard = transcriptOf(event);
    if (heard.text === "") return; // an event with no usable words says nothing
    if (heard.final) handlers.onFinal(heard.text);
    else handlers.onInterim(heard.text);
  };
  native.onerror = (event) => {
    if (live) handlers.onError(failureOf(event.error));
  };
  native.onend = () => {
    if (!live) return;
    detach();
    handlers.onEnd();
  };
  return { live: () => live, detach };
}

/** A fresh recogniser for one session, or undefined where there is no API (or in the native shell, or it will not build). */
export function createRecognizer(handlers: RecognizerHandlers, options: RecognizerOptions, win: VoiceWindow | undefined = browserWindow()): Recognizer | undefined {
  const Native = isNative(win) ? undefined : constructorOf(win);
  if (!Native) return undefined;
  let native: NativeRecognition;
  try {
    native = new Native();
  } catch {
    return undefined;
  }
  native.lang = options.lang;
  native.continuous = false; // one phrase per press: the session ends when the person stops talking
  native.interimResults = true; // the words reach the field while they are said
  native.maxAlternatives = 1;
  const link = listenTo(native, handlers);

  return {
    start() {
      try {
        native.start();
      } catch {
        // start() throws when the page may not listen at all (a blocked context, a recogniser already running): the same
        // outcome as any other failure, so the person is told and the session closes.
        if (!link.live()) return;
        handlers.onError("error");
        link.detach();
        handlers.onEnd();
      }
    },
    stop() {
      try {
        native.stop();
      } catch {
        // Nothing to stop: the session is already over, and its end event is on its way.
      }
    },
    abort() {
      link.detach();
      try {
        native.abort();
      } catch {
        // Already over. The handlers are gone, so nothing more is heard from this session either way.
      }
    },
  };
}
