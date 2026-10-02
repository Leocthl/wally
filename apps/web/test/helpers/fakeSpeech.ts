// A stand-in for the browser's SpeechRecognition (jsdom has none): it records what the page asks of it, and a test says
// what the browser would report. Install it with vi.stubGlobal("SpeechRecognition", FakeRecognition).

/** One phrase the recogniser heard: its words and whether it is settled (interim by default). */
export type Phrase = readonly [text: string, final?: boolean];

export class FakeRecognition {
  /** Every recogniser the page built, oldest first. Reset it in beforeEach. */
  static made: FakeRecognition[] = [];

  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  started = 0;
  stopped = 0;
  aborted = 0;

  constructor() {
    FakeRecognition.made = [...FakeRecognition.made, this];
  }

  /** The recogniser the page built last. */
  static last(): FakeRecognition {
    const recogniser = FakeRecognition.made.at(-1);
    if (!recogniser) throw new Error("the page built no recogniser");
    return recogniser;
  }

  start(): void {
    this.started += 1;
    this.onstart?.();
  }

  stop(): void {
    this.stopped += 1;
  }

  abort(): void {
    this.aborted += 1;
  }

  /** The browser reports everything heard this session, one entry per phrase (as Chrome does). */
  hear(...phrases: readonly Phrase[]): void {
    const results = phrases.map(([transcript, isFinal = false]) => ({ isFinal, length: 1, 0: { transcript, confidence: 0.9 } }));
    this.onresult?.({ resultIndex: 0, results });
  }

  /** The browser reports an error code (no-speech, not-allowed, network, ...). */
  fail(code: string): void {
    this.onerror?.({ error: code, message: "" });
  }

  /** The session is over. */
  end(): void {
    this.onend?.();
  }
}
