// One listening session: a recogniser, the text it has put in the field, and how it winds down. No React in here. The hook
// above it gives two callbacks (write into the field, report to the state machine) and asks it to stop or drop.
import { joinSpoken } from "./joinSpoken";
import { createRecognizer, type VoiceWindow } from "./recognizer";
import type { VoiceEvent } from "./voiceState";

export interface SessionOptions {
  /** BCP 47 tag to listen for. */
  readonly lang: string;
  /** What the field held when the mic was pressed: spoken words go after it. */
  readonly typed: string;
  /** The field's character cap. */
  readonly maxLength: number | undefined;
  /** Puts the new text in the field. */
  readonly write: (next: string) => void;
  /** Tells the state machine what happened. */
  readonly report: (event: VoiceEvent) => void;
}

export interface VoiceSession {
  /** Still tied to a recogniser: listening, or winding down. False once it has ended or been dropped. */
  readonly live: () => boolean;
  /** Listening for more words: live, and neither stopped nor failed. */
  readonly listening: () => boolean;
  /** This session wrote exactly this text into the field (or it is what the field held to begin with). */
  readonly owns: (text: string) => boolean;
  /** The person pressed stop: the browser hands over the last words it heard, then ends. Reports rest at once. */
  readonly stop: () => void;
  /** Gone for good: not another word or event from it, and nothing is reported. */
  readonly drop: () => void;
}

/** Starts listening. Without a recogniser it reports the failure and returns undefined. `win` is for tests (default: the page). */
export function startSession({ lang, typed, maxLength, write, report }: SessionOptions, win?: VoiceWindow): VoiceSession | undefined {
  let live = true;
  /** Stop was pressed, or the session failed: it is no longer listening, only words already on their way still land. */
  let finishing = false;
  let heard = false;
  let written: readonly string[] = [typed];

  const put = (spoken: string): void => {
    heard = true;
    const next = joinSpoken(typed, spoken, maxLength);
    if (next === written.at(-1)) return;
    written = [...written, next];
    write(next);
  };
  const recognizer = createRecognizer(
    {
      onInterim: put,
      onFinal: put,
      onError: (failure) => {
        if (finishing) return; // the person already stopped it
        finishing = true; // not listening any more, even if the browser is slow to send its end event
        report({ type: "failed", failure });
      },
      onEnd: () => {
        live = false;
        if (!finishing) report(heard ? { type: "idle" } : { type: "failed", failure: "noSpeech" });
      },
    },
    { lang },
    win,
  );
  if (!recognizer) {
    report({ type: "failed", failure: "error" });
    return undefined;
  }
  report({ type: "listening" });
  recognizer.start();

  return {
    live: () => live,
    listening: () => live && !finishing,
    owns: (text) => written.includes(text),
    stop: () => {
      if (!live || finishing) return;
      finishing = true;
      recognizer.stop();
      report({ type: "idle" });
    },
    drop: () => {
      live = false;
      recognizer.abort();
    },
  };
}
