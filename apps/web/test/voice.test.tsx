// Voice input in the Ask sheet. A fake recogniser stands in for the browser's (jsdom has none), so every state a person
// can meet is driven from here: the words arriving, each error code, the end, the first-use note, stop, and the cleanup.
// The AskSheet itself is rendered, so the wiring inside AskField is covered too. The pure parts are in voiceCore.test.ts.
import { FakeClock } from "@laisee/core/testing";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockApiClient } from "../src/api/MockApiClient";
import { BoothProvider } from "../src/hooks/useBooth";
import { VOICE } from "../src/i18n/voice";
import { AskSheet } from "../src/shell/AskSheet";
import { VOICE_NOTE_KEY } from "../src/shell/voice/useVoiceInput";
import { LocaleProvider, type Locale } from "../src/ui/locale";
import { FakeRecognition } from "./helpers/fakeSpeech";

vi.setConfig({ testTimeout: 20_000 });

const NOTE = "Uses your browser's speech service. Audio may leave this device.";
const BLOCKED = "Microphone is blocked. You can type instead, or allow it in your browser settings.";
const GENERIC = "Voice input isn't working here. You can type instead.";

interface OpenOptions {
  readonly locale?: Locale;
  /** The first-use note was shown on an earlier visit (the default). Pass false for a first-time visitor. */
  readonly noteSeen?: boolean;
}

/** The real Ask sheet over the offline mock, open, with a test double for the asker. */
async function openAsk({ locale = "en", noteSeen = true }: OpenOptions = {}) {
  if (noteSeen) window.localStorage.setItem(VOICE_NOTE_KEY, "1");
  const api = new MockApiClient({ clock: new FakeClock(), sleep: async () => undefined, pace: 0 });
  const onAsk = vi.fn();
  const user = userEvent.setup();
  const tree = (open: boolean): ReactElement => (
    <LocaleProvider locale={locale}>
      <BoothProvider api={api}>
        <AskSheet open={open} onClose={() => undefined} onAsk={onAsk} />
      </BoothProvider>
    </LocaleProvider>
  );
  const view = render(tree(true));
  await waitFor(async () => expect((await api.snapshot()).mandate).not.toBeNull());
  const sheet = await screen.findByRole("dialog");
  // The booth is idle once its scenario shortcuts are enabled; until then Send would ignore a press.
  await waitFor(() => expect(sheet.querySelector("[data-scenario]")).toBeEnabled());
  return { user, sheet, onAsk, view, setOpen: (open: boolean) => view.rerender(tree(open)) };
}

const mic = (sheet: HTMLElement, name = "Speak your request"): HTMLElement => within(sheet).getByRole("button", { name });
const field = (sheet: HTMLElement): HTMLInputElement => within(sheet).getByRole<HTMLInputElement>("textbox", { name: /Tell Wally what you need/ });
const status = (sheet: HTMLElement): HTMLElement => within(sheet).getByRole("status");
const send = (sheet: HTMLElement): HTMLElement => within(sheet).getByRole("button", { name: "Send" });

/** The browser calls back outside React's own events: wrap it, so React flushes what it causes. */
const fire = (what: () => void): void => {
  act(what);
};

beforeEach(() => {
  window.localStorage.clear();
  FakeRecognition.made = [];
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("where voice input is unavailable", () => {
  it("draws no mic and no status line when the page has no speech API", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    const { sheet } = await openAsk();
    expect(within(sheet).queryByRole("button", { name: "Speak your request" })).toBeNull();
    expect(within(sheet).queryByRole("status")).toBeNull();
    expect(field(sheet)).toBeInTheDocument();
    expect(send(sheet)).toBeDisabled();
  });

  it("draws nothing inside the native shell, even where the API exists", async () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    const { sheet } = await openAsk();
    expect(within(sheet).queryByRole("button", { name: "Speak your request" })).toBeNull();
    expect(within(sheet).queryByRole("status")).toBeNull();
    expect(FakeRecognition.made).toHaveLength(0);
  });

  it("draws the mic for a browser that has only the prefixed name (Safari, Chrome)", async () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    expect(FakeRecognition.made).toHaveLength(1);
  });
});

describe("listening", () => {
  it.each([
    ["en", "en-US", "Speak your request"],
    ["zh-HK", "zh-HK", VOICE.speak.zh],
  ] as const)("listens in the screen's language (%s -> %s), one phrase at a time, with interim words", async (locale, lang, name) => {
    const { user, sheet } = await openAsk({ locale });
    await user.click(mic(sheet, name));
    const recogniser = FakeRecognition.last();
    expect(recogniser.started).toBe(1);
    expect(recogniser.lang).toBe(lang);
    expect(recogniser.continuous).toBe(false);
    expect(recogniser.interimResults).toBe(true);
    expect(recogniser.maxAlternatives).toBe(1);
  });

  it("shows a pressed mic and says Listening... in a polite live region", async () => {
    const { user, sheet } = await openAsk();
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    expect(status(sheet)).toHaveAttribute("aria-live", "polite");
    expect(status(sheet)).toBeEmptyDOMElement();
    await user.click(mic(sheet));
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "true");
    expect(status(sheet).textContent).toBe("Listening...");
  });

  it("puts the words in the field as they are said, and Send is still the person's to press", async () => {
    const { user, sheet, onAsk } = await openAsk();
    await user.click(mic(sheet));
    const recogniser = FakeRecognition.last();
    fire(() => recogniser.hear(["a plain"]));
    expect(field(sheet)).toHaveValue("a plain");
    fire(() => recogniser.hear(["a plain white tee"]));
    expect(field(sheet)).toHaveValue("a plain white tee");
    fire(() => recogniser.hear(["a plain white tee under HK$150", true]));
    expect(field(sheet)).toHaveValue("a plain white tee under HK$150");
    fire(() => recogniser.end());

    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    expect(status(sheet)).toBeEmptyDOMElement();
    expect(send(sheet)).toBeEnabled();
    expect(onAsk).not.toHaveBeenCalled();

    await user.click(send(sheet));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith("a plain white tee under HK$150");
  });

  it("adds the spoken words after what was typed, and each new interim replaces the last", async () => {
    const { user, sheet, onAsk } = await openAsk();
    await user.type(field(sheet), "A plain tee");
    await user.click(mic(sheet));
    expect(onAsk).not.toHaveBeenCalled(); // pressing the mic is not pressing Send
    const first = FakeRecognition.last();
    fire(() => first.hear(["under"]));
    expect(field(sheet)).toHaveValue("A plain tee under");
    fire(() => first.hear(["under HK$150"]));
    expect(field(sheet)).toHaveValue("A plain tee under HK$150");
    fire(() => {
      first.hear(["under HK$150", true]);
      first.end();
    });

    await user.click(mic(sheet)); // a second press adds again, after everything already in the field
    fire(() => FakeRecognition.last().hear(["please", true]));
    expect(FakeRecognition.made).toHaveLength(2);
    expect(field(sheet)).toHaveValue("A plain tee under HK$150 please");
  });

  it("keeps one space, not two, after typed text that already ends in a space", async () => {
    const { user, sheet } = await openAsk();
    await user.type(field(sheet), "A plain tee ");
    await user.click(mic(sheet));
    fire(() => FakeRecognition.last().hear(["under HK$150"]));
    expect(field(sheet)).toHaveValue("A plain tee under HK$150");
  });

  it("stops the spoken words at the field's character cap", async () => {
    const { user, sheet } = await openAsk();
    fireEvent.change(field(sheet), { target: { value: "x".repeat(995) } });
    await user.click(mic(sheet));
    fire(() => FakeRecognition.last().hear(["abcdefghijklmnop"]));
    expect(field(sheet).value).toBe(`${"x".repeat(995)} abcd`);
    expect(field(sheet).value).toHaveLength(1000);
  });
});

describe("when listening does not work out", () => {
  it.each([
    ["no-speech", "I didn't hear anything. Try again."],
    ["not-allowed", BLOCKED],
    ["service-not-allowed", BLOCKED],
    ["network", "Speech service isn't reachable right now. You can type instead."],
    ["audio-capture", GENERIC],
    ["language-not-supported", GENERIC],
  ] as const)("%s says so in plain words and puts nothing in the field", async (code, words) => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    fire(() => {
      FakeRecognition.last().fail(code);
      FakeRecognition.last().end();
    });
    expect(status(sheet).textContent).toBe(words);
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    expect(field(sheet)).toHaveValue("");
  });

  it("says nothing when the session was aborted (it is no fault), and keeps the words so far", async () => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    fire(() => FakeRecognition.last().hear(["a plain tee"]));
    fire(() => {
      FakeRecognition.last().fail("aborted");
      FakeRecognition.last().end();
    });
    expect(status(sheet)).toBeEmptyDOMElement();
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    expect(field(sheet)).toHaveValue("a plain tee");
  });

  it("says it heard nothing when the session ends with no words and no error", async () => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    fire(() => FakeRecognition.last().end());
    expect(status(sheet).textContent).toBe("I didn't hear anything. Try again.");
  });

  it("listens again on the next press after an error", async () => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    fire(() => {
      FakeRecognition.last().fail("not-allowed");
      FakeRecognition.last().end();
    });
    expect(status(sheet).textContent).toBe(BLOCKED);
    await user.click(mic(sheet));
    expect(FakeRecognition.made).toHaveLength(2);
    expect(status(sheet).textContent).toBe("Listening...");
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "true");
  });

  it("listens again on the next press even when the browser never sends its end event after an error", async () => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    const stuck = FakeRecognition.last();
    fire(() => stuck.fail("network")); // no end event follows
    expect(status(sheet).textContent).toBe("Speech service isn't reachable right now. You can type instead.");
    await user.click(mic(sheet)); // this is a new try, not a stop
    expect(stuck.stopped).toBe(0);
    expect(stuck.aborted).toBe(1);
    expect(FakeRecognition.made).toHaveLength(2);
    expect(status(sheet).textContent).toBe("Listening...");
  });

  it("tells the person when the browser refuses to start, and when it cannot build a recogniser at all", async () => {
    class Refuses extends FakeRecognition {
      override start(): void {
        throw new DOMException("already started", "InvalidStateError");
      }
    }
    vi.stubGlobal("SpeechRecognition", Refuses);
    const refused = await openAsk();
    await refused.user.click(mic(refused.sheet));
    expect(status(refused.sheet).textContent).toBe(GENERIC);
    expect(mic(refused.sheet)).toHaveAttribute("aria-pressed", "false");
    refused.view.unmount();

    class Unbuildable {
      constructor() {
        throw new Error("no recogniser here");
      }
    }
    vi.stubGlobal("SpeechRecognition", Unbuildable);
    const unbuildable = await openAsk();
    await unbuildable.user.click(mic(unbuildable.sheet));
    expect(status(unbuildable.sheet).textContent).toBe(GENERIC);
  });
});

describe("the first-use note", () => {
  it("shows once, before anything listens, and never again", async () => {
    const { user, sheet, view } = await openAsk({ noteSeen: false });
    await user.click(mic(sheet));
    expect(FakeRecognition.made).toHaveLength(0); // nothing listens yet
    expect(status(sheet).textContent).toBe(NOTE);
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem(VOICE_NOTE_KEY)).toBe("1");

    await user.click(mic(sheet)); // pressing the mic again is the yes
    expect(FakeRecognition.made).toHaveLength(1);
    expect(status(sheet).textContent).toBe("Listening...");
    fire(() => {
      FakeRecognition.last().hear(["tee", true]);
      FakeRecognition.last().end();
    });

    await user.click(mic(sheet)); // later in the same visit
    expect(FakeRecognition.made).toHaveLength(2);
    expect(status(sheet).textContent).toBe("Listening...");

    view.unmount(); // and on a later visit: the sheet opens afresh, the note is remembered
    const later = await openAsk({ noteSeen: false });
    await later.user.click(mic(later.sheet));
    expect(FakeRecognition.made).toHaveLength(3);
    expect(status(later.sheet).textContent).toBe("Listening...");
  });

  it("still shows once and then listens when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { user, sheet } = await openAsk({ noteSeen: false });
    await user.click(mic(sheet));
    expect(status(sheet).textContent).toBe(NOTE);
    expect(FakeRecognition.made).toHaveLength(0);
    await user.click(mic(sheet));
    expect(FakeRecognition.made).toHaveLength(1);
    expect(status(sheet).textContent).toBe("Listening...");
  });

  it("speaks zh-HK on a zh-HK screen: the label, the note, the listening line and an error", async () => {
    const { user, sheet } = await openAsk({ locale: "zh-HK", noteSeen: false });
    await user.click(mic(sheet, VOICE.speak.zh));
    expect(status(sheet).textContent).toBe(VOICE.firstUseNote.zh);
    await user.click(mic(sheet, VOICE.speak.zh));
    expect(status(sheet).textContent).toBe(VOICE.listening.zh);
    fire(() => {
      FakeRecognition.last().fail("not-allowed");
      FakeRecognition.last().end();
    });
    expect(status(sheet).textContent).toBe(VOICE.denied.zh);
  });
});

describe("stopping, and cleaning up", () => {
  it("stop ends the listening at once, lets the last words land, and does not call it a failure", async () => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    const recogniser = FakeRecognition.last();
    fire(() => recogniser.hear(["a plain tee"]));
    await user.click(mic(sheet));
    expect(recogniser.stopped).toBe(1);
    expect(recogniser.aborted).toBe(0);
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    expect(status(sheet)).toBeEmptyDOMElement();

    fire(() => {
      recogniser.hear(["a plain tee please", true]);
      recogniser.end();
    });
    expect(field(sheet)).toHaveValue("a plain tee please");
    expect(status(sheet)).toBeEmptyDOMElement(); // stopping with nothing heard is not "I didn't hear anything"
  });

  it("returns to rest by itself when the session ends after words", async () => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    fire(() => {
      FakeRecognition.last().hear(["a plain tee", true]);
      FakeRecognition.last().end();
    });
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    expect(status(sheet)).toBeEmptyDOMElement();
    expect(field(sheet)).toHaveValue("a plain tee");
  });

  it("aborts the recogniser when the field unmounts", async () => {
    const { user, sheet, view } = await openAsk();
    await user.click(mic(sheet));
    const recogniser = FakeRecognition.last();
    view.unmount();
    expect(recogniser.aborted).toBe(1);
    expect(recogniser.onresult).toBeNull(); // nothing it hears reaches a field that is gone
    expect(recogniser.onend).toBeNull();
  });

  it("aborts the recogniser when the sheet closes", async () => {
    const { user, sheet, setOpen } = await openAsk();
    await user.click(mic(sheet));
    const recogniser = FakeRecognition.last();
    setOpen(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(recogniser.aborted).toBe(1);
  });

  it("lets typing win: a keystroke while listening ends the session and keeps what is in the field", async () => {
    const { user, sheet } = await openAsk();
    await user.click(mic(sheet));
    const recogniser = FakeRecognition.last();
    fire(() => recogniser.hear(["a plain"]));
    await user.type(field(sheet), " tee");
    expect(recogniser.aborted).toBe(1);
    expect(mic(sheet)).toHaveAttribute("aria-pressed", "false");
    fire(() => recogniser.hear(["a plain white tee", true])); // too late: the session is dropped
    expect(field(sheet)).toHaveValue("a plain tee");
  });
});
