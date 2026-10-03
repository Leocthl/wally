// Private practice wallets for the visitors of the booth. The booth Mac keeps the one shared wallet it always had; every
// other client (a phone that scanned the QR) gets a wallet of its own, made on its first request: its own demo keys,
// its own in-memory log, its own orchestrator and event hub, the preset budget sealed at once. The judge (Laya) and the
// planner (Qwen) are shared. This file is the bookkeeping only: which wallet a request gets, how many there can be,
// when one is dropped. It knows nothing of HTTP (server/sessionScope.ts) or of how a wallet is built (server/compose.ts).
// Web-standard APIs only (no node: imports). The booth's own wallet is never counted, dropped or timed out.
import type { BoothBackend } from "./backend";
import { BoothError } from "./http/errors";
import { SILENT_LOGGER, type Logger } from "./http/routes";
import { newSessionId, sessionIdFrom } from "./http/sessionWire";
import type { SseHub } from "./http/sse";
import type { Env } from "./booth/settings";

export { newSessionId, SESSION_COOKIE, SESSION_HEADER, SESSION_ID_RE } from "./http/sessionWire";

/** ASSUMED: visitor wallets at one time. Enough for a crowd at the booth (the QA run used five phones) and bounded memory. */
export const MAX_VISITOR_SESSIONS = 12;
/** ASSUMED: a wallet nobody has used for this long is dropped. A page with its event stream open counts as in use. */
export const SESSION_IDLE_TTL_MS = 45 * 60_000;
/** The brief: the booth ticks every second (R11 windows [F31] are 60 s, card TTL [F30] 30 min); the visitors' wallets tick on the same beat. */
export const SESSION_TICK_MS = 1_000;
/** ASSUMED: after a page's old id got it a new wallet, requests it had already sent with the old id still reach that wallet for this long. */
export const REPLACEMENT_WINDOW_MS = 10_000;
/** ASSUMED: old ids remembered for that window; a visitor with garbage ids cannot grow this list without end. */
const MAX_REPLACEMENTS = 64;

const UNAVAILABLE_MESSAGE = "Wally could not start a practice wallet just now. Try again in a moment.";

/** What a request runs against: a wallet and the hub that carries its events. */
export interface SessionScope {
  readonly backend: BoothBackend;
  readonly hub: SseHub;
}

/** A visitor's wallet as the composition root builds it. `close` ends its events and drops its state. */
export interface VisitorSession extends SessionScope {
  tick(): Promise<void>;
  close(): void;
}

export type Resolution =
  | { readonly kind: "booth"; readonly scope: SessionScope }
  | { readonly kind: "visitor"; readonly scope: SessionScope; readonly id: string };

export interface Who {
  /** Host and socket peer both loopback: the page on the booth Mac (http/lan.ts isLocalClient). */
  readonly booth: boolean;
  /** The wallet id the request carried (cookie or header), whatever its shape. */
  readonly presented: string | null;
}

export interface SessionRegistryOptions {
  readonly booth: SessionScope;
  readonly create: () => Promise<VisitorSession>;
  /** Wall-clock milliseconds, for idleness. Default Date.now; the booth passes its own clock so a test can move time. */
  readonly now?: () => number;
  /** Monotonic milliseconds, for how long a wallet took to make. Default performance.now; never the engine's clock, which a test may freeze. */
  readonly timer?: () => number;
  readonly newId?: () => string;
  readonly maxVisitors?: number;
  readonly idleTtlMs?: number;
  /** Sweep and tick interval; null = no timer (tests do both by hand). */
  readonly tickMs?: number | null;
  readonly logger?: Logger;
}

export interface SessionStats {
  readonly live: number;
  readonly created: number;
  readonly evicted: number;
  readonly expired: number;
  /** How long the last and the slowest wallet took to make, in ms; null before the first. */
  readonly lastCreateMs: number | null;
  readonly maxCreateMs: number | null;
}

interface Entry {
  readonly id: string;
  readonly session: VisitorSession;
  /** What a request is handed: the wallet and its hub, without the power to tick or close it. Made once. */
  readonly scope: SessionScope;
  readonly lastSeen: number;
}

interface Replacement {
  readonly id: string;
  readonly at: number;
}

const unavailable = (): BoothError => new BoothError(503, "SESSION_UNAVAILABLE", UNAVAILABLE_MESSAGE);
const reason = (err: unknown): string => (err instanceof Error ? err.message : "unknown error");
const shortId = (id: string): string => id.slice(0, 6);

export class SessionRegistry {
  readonly #opts: SessionRegistryOptions;
  readonly #now: () => number;
  readonly #mono: () => number;
  readonly #newId: () => string;
  readonly #max: number;
  readonly #ttl: number;
  readonly #log: Logger;
  /** Insertion order is use order: the first entry is the one nobody has touched longest. Replaced, never edited. */
  #entries: ReadonlyMap<string, Entry> = new Map();
  /** Wallets being made for a request that carried an id nobody knows, by that id. */
  #pending: ReadonlyMap<string, Promise<Entry>> = new Map();
  /** Old id -> the wallet it got, for REPLACEMENT_WINDOW_MS. */
  #replaced: ReadonlyMap<string, Replacement> = new Map();
  #timer: ReturnType<typeof setInterval> | null = null;
  #closed = false;
  #stats = { created: 0, evicted: 0, expired: 0, lastCreateMs: null as number | null, maxCreateMs: null as number | null };

  constructor(opts: SessionRegistryOptions) {
    this.#opts = opts;
    this.#now = opts.now ?? Date.now;
    this.#mono = opts.timer ?? (() => performance.now());
    this.#newId = opts.newId ?? (() => newSessionId());
    this.#max = opts.maxVisitors ?? MAX_VISITOR_SESSIONS;
    this.#ttl = opts.idleTtlMs ?? SESSION_IDLE_TTL_MS;
    this.#log = opts.logger ?? SILENT_LOGGER;
    const every = opts.tickMs === undefined ? SESSION_TICK_MS : opts.tickMs;
    if (every !== null) {
      this.#timer = setInterval(() => void this.maintain(), every);
      this.#timer.unref?.();
    }
  }

  /** Visitor wallets alive now. */
  get size(): number {
    return this.#entries.size;
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  stats(): SessionStats {
    return { live: this.#entries.size, ...this.#stats };
  }

  /**
   * The wallet this request runs against. The booth Mac always gets the shared one. A visitor gets the wallet its id names,
   * or, for no id, an id nobody knows or one that ran out, a new wallet under a new id: never an error, and never an id the
   * client chose. Throws 503 only when a wallet cannot be made.
   */
  async resolve(who: Who): Promise<Resolution> {
    if (who.booth) return { kind: "booth", scope: this.#opts.booth };
    if (this.#closed) throw unavailable();
    const presented = sessionIdFrom(who.presented);
    const now = this.#now();
    const known = presented === null ? undefined : this.#entries.get(presented);
    if (known !== undefined) {
      if (!this.#expired(known, now)) return this.#visitor(this.#touch(known, now));
      this.#drop(known.id, "expired");
    }
    return this.#visitor(await this.#fresh(presented, now));
  }

  /** Drops every wallet that has been idle for the whole TTL (and has no page connected). Returns how many. */
  sweep(): number {
    const now = this.#now();
    const idle = [...this.#entries.values()].filter((entry) => this.#expired(entry, now));
    for (const entry of idle) this.#drop(entry.id, "expired");
    return idle.length;
  }

  /** Ticks every visitor wallet (expiries inside a wallet: R11 windows, card TTL), as the booth's timer does for the shared one. */
  async tickAll(): Promise<void> {
    await Promise.all(
      [...this.#entries.values()].map((entry) =>
        entry.session.tick().catch((err: unknown) => this.#log.error(`practice wallet ${shortId(entry.id)}: tick failed: ${reason(err)}`)),
      ),
    );
  }

  /** What the timer does: forget what ran out, then tick what is left. */
  async maintain(): Promise<void> {
    this.sweep();
    await this.tickAll();
  }

  /** Ends every visitor wallet and the timer. Visitors are refused afterwards; the booth's wallet is not ours to close. */
  close(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    this.#closed = true;
    for (const id of [...this.#entries.keys()]) this.#drop(id, "closed");
    this.#pending = new Map();
    this.#replaced = new Map();
  }

  #visitor(entry: Entry): Resolution {
    return { kind: "visitor", scope: entry.scope, id: entry.id };
  }

  #expired(entry: Entry, now: number): boolean {
    return now - entry.lastSeen >= this.#ttl && entry.session.hub.clientCount === 0;
  }

  /** The entry with its use time moved up; it goes to the back of the line. */
  #touch(entry: Entry, now: number): Entry {
    const next = { ...entry, lastSeen: now };
    this.#entries = new Map([...[...this.#entries].filter(([id]) => id !== entry.id), [entry.id, next]]);
    return next;
  }

  #drop(id: string, why: "evicted" | "expired" | "closed"): void {
    const entry = this.#entries.get(id);
    if (entry === undefined) return;
    this.#entries = new Map([...this.#entries].filter(([key]) => key !== id));
    if (why === "evicted") this.#stats = { ...this.#stats, evicted: this.#stats.evicted + 1 };
    if (why === "expired") this.#stats = { ...this.#stats, expired: this.#stats.expired + 1 };
    try {
      entry.session.close();
    } catch (err) {
      this.#log.error(`practice wallet ${shortId(id)}: close failed: ${reason(err)}`);
    }
    if (why !== "closed") this.#log.info(`practice wallet ${shortId(id)} dropped (${why}); ${this.#entries.size} live`);
  }

  /**
   * A new wallet for a request whose id is missing or unknown. Requests that carry the same unknown id (a page that woke up
   * after its wallet was dropped sends several at once) share one wallet instead of making one each. Registers the shared
   * promise before anything is awaited, so the second request of the burst finds it.
   */
  #fresh(presented: string | null, now: number): Promise<Entry> {
    if (presented !== null) {
      const joined = this.#pending.get(presented);
      if (joined !== undefined) return joined;
      const done = this.#replaced.get(presented);
      const alive = done !== undefined && now - done.at < REPLACEMENT_WINDOW_MS ? this.#entries.get(done.id) : undefined;
      if (alive !== undefined) return Promise.resolve(this.#touch(alive, now));
    }
    const making = this.#make(presented);
    if (presented !== null) {
      this.#pending = new Map(this.#pending).set(presented, making);
      const settled = (): void => {
        this.#pending = new Map([...this.#pending].filter(([key]) => key !== presented));
      };
      making.then(settled, settled);
    }
    return making;
  }

  async #make(presented: string | null): Promise<Entry> {
    const started = this.#mono();
    let session: VisitorSession;
    try {
      session = await this.#opts.create();
    } catch (err) {
      this.#log.error(`practice wallet could not be made: ${reason(err)}`);
      throw unavailable();
    }
    if (this.#closed) {
      session.close();
      throw unavailable();
    }
    const took = Math.round(this.#mono() - started);
    const now = this.#now();
    const entry: Entry = { id: this.#newId(), session, scope: { backend: session.backend, hub: session.hub }, lastSeen: now };
    this.#insert(entry);
    this.#stats = { ...this.#stats, created: this.#stats.created + 1, lastCreateMs: took, maxCreateMs: Math.max(this.#stats.maxCreateMs ?? 0, took) };
    if (presented !== null) this.#remember(presented, entry.id, now);
    this.#log.info(`practice wallet ${shortId(entry.id)} started in ${took} ms; ${this.#entries.size} live`);
    return entry;
  }

  /** Adds the entry at the back of the line, dropping the least recently used wallets first while the cap is full. */
  #insert(entry: Entry): void {
    while (this.#entries.size >= this.#max) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) break;
      this.#drop(oldest.value, "evicted");
    }
    this.#entries = new Map([...this.#entries, [entry.id, entry]]);
  }

  #remember(oldId: string, id: string, at: number): void {
    const kept = [...this.#replaced].filter(([, found]) => at - found.at < REPLACEMENT_WINDOW_MS).slice(-(MAX_REPLACEMENTS - 1));
    this.#replaced = new Map([...kept, [oldId, { id, at }]]);
  }
}

export type SessionsMode = "on" | "off";

/**
 * WALLY_SESSIONS=on|off. Unset: on when LAN mode is on (that is when visitors exist), off otherwise. A value that is neither
 * fails closed to off, with a note for the operator: off is the shared booth wallet this server always had.
 */
export function sessionsModeFromEnv(env: Env, lanOn: boolean): { readonly mode: SessionsMode; readonly note: string | null } {
  const raw = env["WALLY_SESSIONS"]?.trim();
  if (raw === undefined || raw === "") return { mode: lanOn ? "on" : "off", note: null };
  const value = raw.toLowerCase();
  if (value === "on" || value === "off") return { mode: value, note: null };
  return { mode: "off", note: `WALLY_SESSIONS=${raw.slice(0, 40)} is not on or off: practice wallets stay off, so every phone shares the booth wallet` };
}
