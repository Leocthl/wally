// Mutable core of the offline mock: the log, the rail, the mandate and the listeners. Every update replaces a value
// (no in-place edits of entries); flows.ts and MockApiClient.ts drive it. Single writer: callers serialise through a queue.
import type { CardRecord, LogEntry, LogPayloadByKind, LogEntryKind, Mandate, PacketState } from "@wally/core/generated";
import type { Clock } from "@wally/core/ports";
import { FakeRail } from "@wally/core/testing";
import type { EscalationView, TraceEvent, TraceListener, Unsubscribe } from "../types";
import { appendEntry, headOf, type TamperedCopy } from "./log";
import { foldCards, foldMockPacket } from "./packet";

export interface SessionOptions {
  readonly clock: Clock;
  readonly sleep: (ms: number) => Promise<void>;
  /** Multiplier for display pauses. 0 in tests. */
  readonly pace: number;
}

export interface EscalationRecord {
  readonly view: EscalationView;
  readonly decisionRunId: string;
}

export class MockSession {
  readonly opts: SessionOptions;
  #entries: readonly LogEntry[] = [];
  #mandate: Mandate | null = null;
  #intentText: string | null = null;
  #logId = "";
  #rail: FakeRail = new FakeRail();
  #listeners: ReadonlySet<TraceListener> = new Set();
  #counter = 0;
  #escalations: ReadonlyMap<string, EscalationRecord> = new Map();
  #tamper: TamperedCopy | null = null;
  #revokedAt: string | undefined;

  constructor(opts: SessionOptions) {
    this.opts = opts;
  }

  now(): Date {
    return this.opts.clock.now();
  }

  nowIso(): string {
    return this.now().toISOString().replace(".000Z", "Z");
  }

  async pause(ms: number): Promise<void> {
    const scaled = ms * this.opts.pace;
    if (scaled > 0) await this.opts.sleep(scaled);
  }

  subscribe(listener: TraceListener): Unsubscribe {
    this.#listeners = new Set([...this.#listeners, listener]);
    return () => {
      this.#listeners = new Set([...this.#listeners].filter((l) => l !== listener));
    };
  }

  emit(event: TraceEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  /** Unique, schema-valid id: prefix_mock0001. */
  nextId(prefix: "dec" | "crt" | "mnd" | "log" | "run"): string {
    this.#counter += 1;
    return `${prefix}_mock${String(this.#counter).padStart(4, "0")}`;
  }

  get rail(): FakeRail {
    return this.#rail;
  }

  get entries(): readonly LogEntry[] {
    return this.#entries;
  }

  get mandate(): Mandate | null {
    return this.#mandate;
  }

  get intentText(): string | null {
    return this.#intentText;
  }

  get logId(): string {
    return this.#logId;
  }

  get revokedAt(): string | undefined {
    return this.#revokedAt;
  }

  get tamper(): TamperedCopy | null {
    return this.#tamper;
  }

  setTamper(copy: TamperedCopy | null): void {
    this.#tamper = copy;
  }

  requireMandate(): Mandate {
    if (!this.#mandate) throw new Error("no mandate sealed yet: seal first (fail closed)");
    return this.#mandate;
  }

  /** Starts a new log for a freshly sealed mandate. Clears everything except the listeners. */
  begin(mandate: Mandate, intentText: string, logId: string): void {
    this.#mandate = mandate;
    this.#intentText = intentText;
    this.#logId = logId;
    this.#entries = [];
    this.#rail = new FakeRail();
    this.#escalations = new Map();
    this.#tamper = null;
    this.#revokedAt = undefined;
  }

  markRevoked(at: string): void {
    this.#revokedAt = at;
  }

  /** Appends one signed (placeholder) entry, then tells listeners about the entry and the folded packet. */
  append<K extends LogEntryKind>(kind: K, payload: LogPayloadByKind[K]): LogEntry {
    this.#entries = appendEntry(this.#entries, this.#logId, kind, payload, this.now());
    const entry = this.#entries.at(-1) as LogEntry;
    this.emit({ type: "log", entry });
    this.emit({ type: "packet", packet: this.packet() });
    return entry;
  }

  packet(): PacketState {
    return foldMockPacket(this.#entries, this.requireMandate(), this.#logId, this.now());
  }

  cards(): readonly CardRecord[] {
    return foldCards(this.#entries);
  }

  head() {
    return headOf(this.#entries);
  }

  get escalations(): ReadonlyMap<string, EscalationRecord> {
    return this.#escalations;
  }

  putEscalation(record: EscalationRecord): void {
    this.#escalations = new Map([...this.#escalations, [record.view.decisionId, record]]);
    this.emit({ type: "escalation", escalation: record.view });
  }
}
