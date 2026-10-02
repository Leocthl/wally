// The pure parts of voice input: joining spoken words to typed ones, the error-code map, the state reducer, and the
// recogniser wrapper over a fake window. The Ask sheet end to end is in voice.test.tsx.
import { describe, expect, it, vi } from "vitest";
import { VOICE } from "../src/i18n/voice";
import { joinSpoken } from "../src/shell/voice/joinSpoken";
import { createRecognizer, failureOf, isVoiceSupported, type RecognizerHandlers, type VoiceFailure, type VoiceWindow } from "../src/shell/voice/recognizer";
import { startSession } from "../src/shell/voice/session";
import { INITIAL_VOICE, reduceVoice, type VoiceEvent, type VoiceState } from "../src/shell/voice/voiceState";
import { FakeRecognition } from "./helpers/fakeSpeech";

function handlers() {
  return { onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() } satisfies RecognizerHandlers;
}

/** A recogniser over a fake window, started, with its fake native object. */
function listening(win: VoiceWindow = { SpeechRecognition: FakeRecognition }) {
  FakeRecognition.made = [];
  const h = handlers();
  const recognizer = createRecognizer(h, { lang: "en-US" }, win);
  if (!recognizer) throw new Error("expected a recogniser");
  recognizer.start();
  return { h, recognizer, native: FakeRecognition.last() };
}

describe("joinSpoken", () => {
  it("puts one space between the typed words and the spoken ones", () => {
    expect(joinSpoken("a plain tee", "under HK$150")).toBe("a plain tee under HK$150");
  });

  it("adds no second space after typed white space, and none to an empty field", () => {
    expect(joinSpoken("a plain tee ", "under")).toBe("a plain tee under");
    expect(joinSpoken("a plain tee\n", "under")).toBe("a plain tee\nunder");
    expect(joinSpoken("", "a plain tee")).toBe("a plain tee");
  });

  it("leaves the field alone for an empty or blank transcript, and trims a padded one", () => {
    expect(joinSpoken("a plain tee", "")).toBe("a plain tee");
    expect(joinSpoken("a plain tee", "   ")).toBe("a plain tee");
    expect(joinSpoken("a", "  b  ")).toBe("a b");
  });

  it("adds no space where Chinese meets Chinese, but does between Chinese and Latin", () => {
    expect(joinSpoken("我想買", "白色T恤")).toBe("我想買白色T恤");
    expect(joinSpoken("我想買。", "白色")).toBe("我想買。白色");
    expect(joinSpoken("我想買", "tee")).toBe("我想買 tee");
    expect(joinSpoken("tee", "白色")).toBe("tee 白色");
  });

  it("cuts at the cap", () => {
    expect(joinSpoken("abc", "defgh", 6)).toBe("abc de");
    expect(joinSpoken("abc", "d", 100)).toBe("abc d");
  });
});

describe("failureOf", () => {
  it.each([
    ["no-speech", "noSpeech"],
    ["not-allowed", "denied"],
    ["service-not-allowed", "denied"],
    ["network", "offline"],
    ["aborted", "aborted"],
    ["audio-capture", "error"],
    ["language-not-supported", "error"],
    ["phrases-not-supported", "error"],
    ["bad-grammar", "error"],
  ] as const)("maps %s to %s", (code, failure) => {
    expect(failureOf(code)).toBe(failure);
  });

  it("calls anything else an error, including keys that exist on every object", () => {
    for (const odd of ["", "constructor", "__proto__", "toString", undefined, null, 42, {}]) expect(failureOf(odd)).toBe("error");
  });
});

describe("reduceVoice", () => {
  const FAILURES: readonly VoiceFailure[] = ["noSpeech", "denied", "offline", "error"];

  it("starts at rest with no note", () => {
    expect(INITIAL_VOICE).toEqual({ status: "idle", note: false });
  });

  it("shows the note at rest, and listening clears it", () => {
    const noted = reduceVoice(INITIAL_VOICE, { type: "note" });
    expect(noted).toEqual({ status: "idle", note: true });
    expect(reduceVoice(noted, { type: "listening" })).toEqual({ status: "listening", note: false });
  });

  it.each(FAILURES)("moves a listening state to %s", (failure) => {
    const listeningState = reduceVoice(INITIAL_VOICE, { type: "listening" });
    expect(reduceVoice(listeningState, { type: "failed", failure })).toEqual({ status: failure, note: false });
  });

  it("treats aborted as a return to rest, not a failure", () => {
    const listeningState = reduceVoice(INITIAL_VOICE, { type: "listening" });
    expect(reduceVoice(listeningState, { type: "failed", failure: "aborted" })).toEqual(INITIAL_VOICE);
  });

  it("lets every failure state listen again", () => {
    for (const failure of FAILURES) {
      const failed = reduceVoice(INITIAL_VOICE, { type: "failed", failure });
      expect(reduceVoice(failed, { type: "listening" }).status).toBe("listening");
    }
  });

  it("returns to rest from anywhere, and hands back the same state when it is already at rest", () => {
    const events: readonly VoiceEvent[] = [{ type: "listening" }, { type: "note" }, { type: "failed", failure: "denied" }];
    for (const event of events) expect(reduceVoice(reduceVoice(INITIAL_VOICE, event), { type: "idle" })).toEqual(INITIAL_VOICE);
    expect(reduceVoice(INITIAL_VOICE, { type: "idle" })).toBe(INITIAL_VOICE);
  });

  it("never edits the state it is given", () => {
    const before: VoiceState = Object.freeze({ status: "listening", note: false });
    const after = reduceVoice(before, { type: "failed", failure: "offline" });
    expect(after).not.toBe(before);
    expect(before).toEqual({ status: "listening", note: false });
  });
});

describe("isVoiceSupported", () => {
  it("is false without the API, and when the API is not a constructor", () => {
    expect(isVoiceSupported()).toBe(false); // jsdom has none
    expect(isVoiceSupported({})).toBe(false);
    expect(isVoiceSupported({ SpeechRecognition: "not a constructor" })).toBe(false);
  });

  it("is true with either name", () => {
    expect(isVoiceSupported({ SpeechRecognition: FakeRecognition })).toBe(true);
    expect(isVoiceSupported({ webkitSpeechRecognition: FakeRecognition })).toBe(true);
  });

  it("is false inside the native shell, API or not", () => {
    const Capacitor = { isNativePlatform: () => true };
    expect(isVoiceSupported({ SpeechRecognition: FakeRecognition, Capacitor })).toBe(false);
    expect(isVoiceSupported({ SpeechRecognition: FakeRecognition, Capacitor: { isNativePlatform: () => false } })).toBe(true);
  });

  it("is false, and nothing throws, when there is no window at all (a server render)", () => {
    vi.stubGlobal("window", undefined);
    expect(isVoiceSupported()).toBe(false);
    expect(createRecognizer(handlers(), { lang: "en-US" })).toBeUndefined();
  });

  it("is false when reading the API throws", () => {
    const win = {};
    Object.defineProperty(win, "SpeechRecognition", {
      get() {
        throw new Error("blocked by the page");
      },
    });
    expect(isVoiceSupported(win)).toBe(false);
  });
});

describe("createRecognizer", () => {
  it("builds nothing without the API, inside the native shell, or when the constructor throws", () => {
    const h = handlers();
    expect(createRecognizer(h, { lang: "en-US" }, {})).toBeUndefined();
    expect(createRecognizer(h, { lang: "en-US" }, { SpeechRecognition: FakeRecognition, Capacitor: { isNativePlatform: () => true } })).toBeUndefined();
    class Unbuildable {
      constructor() {
        throw new Error("no");
      }
    }
    expect(createRecognizer(h, { lang: "en-US" }, { SpeechRecognition: Unbuildable })).toBeUndefined();
  });

  it("sets up one phrase at a time, with interim words, in the asked language", () => {
    const { native } = listening();
    expect(native).toMatchObject({ lang: "en-US", continuous: false, interimResults: true, maxAlternatives: 1, started: 1 });
  });

  it("hands over interim words, then settled ones, with the phrases joined and the white space tidied", () => {
    const { h, native } = listening();
    native.hear(["  hello "]);
    native.hear(["hello", false], [" world", false]);
    expect(h.onInterim.mock.calls).toEqual([["hello"], ["hello world"]]);
    native.hear(["hello", true], [" wide   world", true]);
    expect(h.onFinal.mock.calls).toEqual([["hello wide world"]]);
    native.hear(["hello", true], [" wor", false]); // one phrase still moving: not settled
    expect(h.onFinal).toHaveBeenCalledTimes(1);
    expect(h.onInterim).toHaveBeenLastCalledWith("hello wor");
  });

  it("skips entries with no usable words and ignores an event with no results", () => {
    const { h, native } = listening();
    native.onresult?.({});
    native.onresult?.({ results: [] });
    native.onresult?.({ results: [{ isFinal: true, length: 0 }, { isFinal: true, length: 1, 0: { transcript: 42 } }] });
    expect(h.onInterim).not.toHaveBeenCalled();
    expect(h.onFinal).not.toHaveBeenCalled();
    native.onresult?.({ results: [{ isFinal: true, length: 0 }, { isFinal: true, length: 1, 0: { transcript: "ok" } }] });
    expect(h.onFinal).toHaveBeenCalledWith("ok");
  });

  it("reports an error code as one of the few outcomes, then the end, once", () => {
    const { h, native } = listening();
    native.fail("network");
    expect(h.onError).toHaveBeenCalledWith("offline");
    native.end();
    native.end();
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(native.onresult).toBeNull(); // the session is closed: nothing more is listened for
    native.hear(["late"]);
    expect(h.onInterim).not.toHaveBeenCalled();
  });

  it("stop finishes the session and still takes the last words", () => {
    const { h, recognizer, native } = listening();
    recognizer.stop();
    expect(native.stopped).toBe(1);
    native.hear(["last words", true]);
    native.end();
    expect(h.onFinal).toHaveBeenCalledWith("last words");
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("abort drops the session: no callback of any kind arrives afterwards, even from a handler the browser kept", () => {
    const { h, recognizer, native } = listening();
    const keptResult = native.onresult;
    const keptError = native.onerror;
    const keptEnd = native.onend;
    recognizer.abort();
    expect(native.aborted).toBe(1);
    keptResult?.({ results: [{ isFinal: true, length: 1, 0: { transcript: "too late" } }] });
    keptError?.({ error: "aborted" });
    keptEnd?.();
    for (const handler of Object.values(h)) expect(handler).not.toHaveBeenCalled();
  });

  it("reports a start that throws as an error and an end, once", () => {
    class Refuses extends FakeRecognition {
      override start(): void {
        throw new DOMException("already started", "InvalidStateError");
      }
    }
    const h = handlers();
    const recognizer = createRecognizer(h, { lang: "en-US" }, { SpeechRecognition: Refuses });
    recognizer?.start();
    expect(h.onError.mock.calls).toEqual([["error"]]);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("does not throw when stop or abort throw", () => {
    class Stubborn extends FakeRecognition {
      override stop(): void {
        throw new Error("already over");
      }
      override abort(): void {
        throw new Error("already over");
      }
    }
    const h = handlers();
    const recognizer = createRecognizer(h, { lang: "en-US" }, { SpeechRecognition: Stubborn });
    recognizer?.start();
    expect(() => recognizer?.stop()).not.toThrow();
    expect(() => recognizer?.abort()).not.toThrow();
  });
});

describe("startSession", () => {
  const WIN: VoiceWindow = { SpeechRecognition: FakeRecognition };

  function begin(typed = "", maxLength?: number) {
    FakeRecognition.made = [];
    const write = vi.fn();
    const report = vi.fn();
    const session = startSession({ lang: "zh-HK", typed, maxLength, write, report }, WIN);
    return { session, write, report, native: FakeRecognition.last() };
  }

  it("reports listening and starts a recogniser in the asked language", () => {
    const { session, report, native } = begin();
    expect(report.mock.calls).toEqual([[{ type: "listening" }]]);
    expect(native).toMatchObject({ lang: "zh-HK", started: 1 });
    expect(session?.listening()).toBe(true);
    expect(session?.live()).toBe(true);
  });

  it("writes the typed words and the spoken ones as they arrive, skipping a repeat, and knows what it wrote", () => {
    const { session, write, native } = begin("x");
    native.hear(["a"]);
    native.hear(["a"]);
    native.hear(["a b"]);
    expect(write.mock.calls).toEqual([["x a"], ["x a b"]]);
    expect(["x", "x a", "x a b"].map((text) => session?.owns(text))).toEqual([true, true, true]);
    expect(session?.owns("x a b c")).toBe(false);
  });

  it("stops the spoken words at the character cap", () => {
    const { write, native } = begin("ab", 5);
    native.hear(["cdefg"]);
    expect(write).toHaveBeenCalledWith("ab cd");
  });

  it("reports rest when it ends after words, and noSpeech when it ends with none", () => {
    const spoken = begin();
    spoken.native.hear(["hello", true]);
    spoken.native.end();
    expect(spoken.report).toHaveBeenLastCalledWith({ type: "idle" });
    expect(spoken.session?.live()).toBe(false);

    const silent = begin();
    silent.native.end();
    expect(silent.report).toHaveBeenLastCalledWith({ type: "failed", failure: "noSpeech" });
  });

  it("stop reports rest once, still takes the last words, and ends quietly", () => {
    const { session, write, report, native } = begin();
    session?.stop();
    session?.stop();
    expect(native.stopped).toBe(1);
    expect(report.mock.calls).toEqual([[{ type: "listening" }], [{ type: "idle" }]]);
    expect(session?.listening()).toBe(false);
    expect(session?.live()).toBe(true);
    native.hear(["last words", true]);
    native.end();
    expect(write).toHaveBeenCalledWith("last words");
    expect(report).toHaveBeenCalledTimes(2);
    expect(session?.live()).toBe(false);
  });

  it("a failure reports once and stops listening; the end that follows says nothing more", () => {
    const { session, report, native } = begin();
    native.fail("not-allowed");
    native.fail("network");
    native.end();
    expect(report.mock.calls).toEqual([[{ type: "listening" }], [{ type: "failed", failure: "denied" }]]);
    expect(session?.listening()).toBe(false);
  });

  it("drop silences it: the recogniser is aborted and nothing more is written or reported", () => {
    const { session, write, report, native } = begin();
    session?.drop();
    expect(native.aborted).toBe(1);
    expect(session?.live()).toBe(false);
    native.hear(["too late", true]);
    native.end();
    expect(write).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1); // only the listening report from the start
  });

  it("reports the failure and returns nothing when there is no recogniser", () => {
    const report = vi.fn();
    expect(startSession({ lang: "en-US", typed: "", maxLength: undefined, write: vi.fn(), report }, {})).toBeUndefined();
    expect(report.mock.calls).toEqual([[{ type: "failed", failure: "error" }]]);
  });
});

describe("VOICE strings", () => {
  const pairs = Object.values(VOICE);

  it("give every line in both languages", () => {
    for (const pair of pairs) {
      expect(pair.en.trim()).not.toBe("");
      expect(pair.zh.trim()).not.toBe("");
    }
  });

  it("hold no digit, dash, curly quote or build-time word", () => {
    for (const line of pairs.flatMap((pair) => [pair.en, pair.zh])) {
      expect(line, line).not.toMatch(/\d/);
      expect(line, line).not.toMatch(/[\u2013\u2014\u2018\u2019\u201c\u201d]/);
      expect(line, line).not.toMatch(/\b(packet|mandate|mint(ed|s|ing)?|lai[ -]?see|red packet)\b/i);
    }
  });

  it("keep the first-use note and the listening line word for word", () => {
    expect(VOICE.firstUseNote.en).toBe("Uses your browser's speech service. Audio may leave this device.");
    expect(VOICE.listening.en).toBe("Listening...");
    expect(VOICE.speak.en).toBe("Speak your request");
  });
});
