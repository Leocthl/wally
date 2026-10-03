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
import type { WalletStats } from "../src/api/http/lanInfo";
import type { Env } from "./booth/settings";

export { newSessionId, SESSION_COOKIE, SESSION_HEADER, SESSION_ID_RE } from "./http/sessionWire";

/** ASSUMED: visitor wallets at one time. Enough for a crowd at the booth (the QA run used five phones) and bounded memory. */
export const MAX_VISITOR_SESSIONS = 12;
/** ASSUMED: a wallet nobody has used for this long is dropped. A page with its event stream open counts as in use, and the clock restarts when the page goes. */
export const SESSION_IDLE_TTL_MS = 45 * 60_000;
/**
 * ASSUMED: a wallet used within this time is not dropped to make room, so a request that is using it is never cut off. A
 * wallet with a page open is never dropped to make room either: that page would reconnect at once with its old id, get a new
 * wallet and drop the next one (13 pages at a cap of 12 made 20 drops in 5 s in a simulation). When nothing can be dropped the
 * next visitor is told the booth is full (503) and the app falls back to its on-device mode.
 */
export const EVICT_GRACE_MS = 5_000;
/**
 * ASSUMED: how often the visitors' wallets are swept and ticked, against the booth's own 1 s. A tick reads and folds the whole
 * log (MEASURED: about 0.8 ms per entry), so twelve wallets of 40 entries at a 1 s beat used 60% of a core on an idle booth Mac.
 * Every request ticks its wallet first, so a slower beat only delays the expiry events pushed to a page that is open (R11
 * windows [F31] are 60 s, card TTL [F30] 30 min), and a wallet with no page open is not ticked at all (tickAll).
 */
export const SESSION_TICK_MS = 5_000;
/** ASSUMED: after a page's old id got it a new wallet, requests it had already sent with the old id still reach that wallet for this long. */
export const REPLACEMENT_WINDOW_MS = 10_000;
/** ASSUMED: old ids remembered for that window; a visitor with garbage ids cannot grow this list without end. */
const MAX_REPLACEMENTS = 64;

const UNAVAILABLE_MESSAGE = "Wally could not start a practice wallet just now. Try again in a moment.";
const FULL_MESSAGE = "Every practice wallet on the booth Mac is in use right now. Try again in a minute.";
/** How often a "booth is full" line may reach the log: a refused page asks again every few seconds. */
const FULL_LOG_EVERY_MS = 10_000;

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
  /** Default EVICT_GRACE_MS. */
  readonly recentMs?: number;
  /** Sweep and tick interval; null = no timer (tests do both by hand). */
  readonly tickMs?: number | null;
  readonly logger?: Logger;
}

export type SessionStats = WalletStats;

interface Entry {
  readonly id: string;
  readonly session: VisitorSession;
  /** What a request is handed: the wallet and its hub, without the power to tick or close it. Made once. */
  readonly scope: SessionScope;
  readonly lastSeen: number;
  /** Which use of any wallet this was, counting up: breaks a tie between two uses in the same millisecond (or on a frozen clock). */
  readonly used: number;
}

interface Replacement {
  readonly id: string;
  readonly at: number;
}

const unavailable = (): BoothError => new BoothError(503, "SESSION_UNAVAILABLE", UNAVAILABLE_MESSAGE);
const full = (): BoothError => new BoothError(503, "SESSION_UNAVAILABLE", FULL_MESSAGE);
const reason = (err: unknown): string => (err instanceof Error ? err.message : "unknown error");
const shortId = (id: string): string => id.slice(0, 6);
/** Was `a` used before `b`: by time, and for the same time by the order of the uses. */
const usedBefore = (a: Entry, b: Entry): boolean => a.lastSeen < b.lastSeen || (a.lastSeen === b.lastSeen && a.used < b.used);

export class SessionRegistry {
  readonly #opts: SessionRegistryOptions;
  readonly #now: () => number;
  readonly #mono: () => number;
  readonly #newId: () => string;
  readonly #max: number;
  readonly #ttl: number;
  readonly #recent: number;
  readonly #log: Logger;
  /** By id, in the order the wallets were made. Replaced, never edited. */
  #entries: ReadonlyMap<string, Entry> = new Map();
  /** Wallets being made: their slots are already taken, before any work is done. */
  #inFlight = 0;
  #uses = 0;
  #lastFullLog = Number.NEGATIVE_INFINITY;
  /** Wallets being made for a request that carried an id nobody knows, by that id. */
  #pending: ReadonlyMap<string, Promise<Entry>> = new Map();
  /** Old id -> the wallet it got, for REPLACEMENT_WINDOW_MS. */
  #replaced: ReadonlyMap<string, Replacement> = new Map();
  #timer: ReturnType<typeof setInterval> | null = null;
  #closed = false;
  #stats = { created: 0, evicted: 0, expired: 0, refused: 0, lastCreateMs: null as number | null, maxCreateMs: null as number | null };

  constructor(opts: SessionRegistryOptions) {
    this.#opts = opts;
    this.#now = opts.now ?? Date.now;
    this.#mono = opts.timer ?? (() => performance.now());
    this.#newId = opts.newId ?? (() => newSessionId());
    this.#max = opts.maxVisitors ?? MAX_VISITOR_SESSIONS;
    this.#ttl = opts.idleTtlMs ?? SESSION_IDLE_TTL_MS;
    this.#recent = opts.recentMs ?? EVICT_GRACE_MS;
    this.#log = opts.logger ?? SILENT_LOGGER;
    const every = opts.tickMs === undefined ? SESSION_TICK_MS : opts.tickMs;
    if (every !== null) {
      // A bug in a timer callback must not become an unhandled rejection, which ends the process mid-demo.
      this.#timer = setInterval(() => void this.maintain().catch((err: unknown) => this.#log.error(`practice wallets: upkeep failed: ${reason(err)}`)), every);
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

  /** Old ids kept for the replacement window (bounded; for tests). */
  get remembered(): number {
    return this.#replaced.size;
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
    const entry = await this.#fresh(presented, now);
    if (!this.#entries.has(entry.id)) throw unavailable(); // dropped while this request waited: never hand out a closed wallet
    return this.#visitor(entry);
  }

  /**
   * Drops every wallet that has been idle for the whole TTL and has no page connected. Returns how many. A page that is open
   * is use: it restarts the idle time of its wallet, so a phone that locks after an hour of reading keeps its wallet for the
   * next 45 minutes instead of losing it at the next sweep.
   */
  sweep(): number {
    const now = this.#now();
    this.#entries = new Map<string, Entry>([...this.#entries].map(([id, entry]): [string, Entry] => [id, entry.session.hub.clientCount > 0 ? { ...entry, lastSeen: now } : entry]));
    const idle = [...this.#entries.values()].filter((entry) => this.#expired(entry, now));
    for (const entry of idle) this.#drop(entry.id, "expired");
    return idle.length;
  }

  /**
   * Ticks the visitor wallets that have a page connected (expiries inside a wallet: R11 windows, card TTL), as the booth's timer
   * does for the shared one. A wallet nobody watches has no one to push to; its next request ticks it before anything else.
   */
  async tickAll(): Promise<void> {
    const watched = [...this.#entries.values()].filter((entry) => entry.session.hub.clientCount > 0);
    await Promise.all(
      watched.map((entry) => entry.session.tick().catch((err: unknown) => this.#log.error(`practice wallet ${shortId(entry.id)}: tick failed: ${reason(err)}`))),
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

  /** The entry, used now. */
  #touch(entry: Entry, now: number): Entry {
    this.#uses += 1;
    const next = { ...entry, lastSeen: now, used: this.#uses };
    this.#entries = new Map<string, Entry>([...this.#entries].map(([id, found]): [string, Entry] => [id, id === entry.id ? next : found]));
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
    this.#admit(); // before any work: a full booth is told so at once
    this.#inFlight += 1;
    const started = this.#mono();
    let session: VisitorSession;
    try {
      session = await this.#opts.create();
    } catch (err) {
      this.#inFlight -= 1;
      this.#log.error(`practice wallet could not be made: ${reason(err)}`);
      throw unavailable();
    }
    if (this.#closed) {
      this.#inFlight -= 1;
      session.close();
      throw unavailable();
    }
    const took = Math.round(this.#mono() - started);
    const now = this.#now();
    this.#uses += 1;
    const entry: Entry = { id: this.#newId(), session, scope: { backend: session.backend, hub: session.hub }, lastSeen: now, used: this.#uses };
    this.#inFlight -= 1;
    this.#entries = new Map([...this.#entries, [entry.id, entry]]); // the slot was taken before the work began: nothing is dropped here
    this.#stats = { ...this.#stats, created: this.#stats.created + 1, lastCreateMs: took, maxCreateMs: Math.max(this.#stats.maxCreateMs ?? 0, took) };
    if (presented !== null) this.#remember(presented, entry.id, now);
    this.#log.info(`practice wallet ${shortId(entry.id)} started in ${took} ms; ${this.#entries.size} live`);
    return entry;
  }

  /** Can this wallet be dropped to make room: no page open on it, and not used just now. */
  #evictable(entry: Entry, now: number): boolean {
    return entry.session.hub.clientCount === 0 && now - entry.lastSeen >= this.#recent;
  }

  /**
   * Takes a slot for one more wallet. A free slot, else the wallet used longest ago among those that can be dropped; when none
   * can, the booth is full: a plain 503 and no work. A wallet with a page open is never the one dropped (see EVICT_GRACE_MS).
   */
  #admit(): void {
    if (this.#entries.size + this.#inFlight < this.#max) return;
    const now = this.#now();
    const victim = [...this.#entries.values()]
      .filter((entry) => this.#evictable(entry, now))
      .reduce<Entry | undefined>((oldest, entry) => (oldest === undefined || usedBefore(entry, oldest) ? entry : oldest), undefined);
    if (victim === undefined) {
      this.#stats = { ...this.#stats, refused: this.#stats.refused + 1 };
      if (now - this.#lastFullLog >= FULL_LOG_EVERY_MS) {
        this.#lastFullLog = now;
        this.#log.info(`practice wallet refused: all ${this.#max} are in use (${this.#stats.refused} refused so far)`);
      }
      throw full();
    }
    this.#drop(victim.id, "evicted");
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
