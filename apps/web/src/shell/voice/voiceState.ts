// The voice input's states, as a pure reducer (every step returns a new state; none is edited in place):
//   idle --first press--> idle + note --press--> listening --words, then the session ends--> idle
//   listening --press--> idle        listening --nothing heard--> noSpeech        listening --error--> denied | offline | error
//   noSpeech | denied | offline | error --press--> listening        anything --dropped (typing over it, closing)--> idle
import type { VoiceFailure } from "./recognizer";

export type VoiceStatus = "idle" | "listening" | "noSpeech" | "denied" | "offline" | "error";

export interface VoiceState {
  readonly status: VoiceStatus;
  /** The first-use note is showing in place of the status words. */
  readonly note: boolean;
}

export type VoiceEvent =
  | { readonly type: "note" }
  | { readonly type: "listening" }
  | { readonly type: "idle" }
  | { readonly type: "failed"; readonly failure: VoiceFailure };

export const INITIAL_VOICE: VoiceState = { status: "idle", note: false };

export function reduceVoice(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "note":
      return { status: "idle", note: true };
    case "listening":
      return { status: "listening", note: false };
    case "idle":
      return state.status === "idle" && !state.note ? state : INITIAL_VOICE;
    case "failed":
      // "aborted" is no fault: the session was ended on purpose, or the browser took the microphone. Back to rest.
      return event.failure === "aborted" ? reduceVoice(state, { type: "idle" }) : { status: event.failure, note: false };
  }
}
