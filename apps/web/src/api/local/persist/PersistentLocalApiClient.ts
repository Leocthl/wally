// The on-device client that remembers. It IS the LocalApiClient (the real stack in the page: engine, orchestrator, signed
// log, SIMULATED rail, recorded planner and judge) with its session kept in the page's localStorage under `wally:session:v1`
// (record.ts), so a reload (a phone does this all the time) no longer starts a new budget. Nothing in the backend, the
// orchestrator or the log changes: the session is brought back by sealing the stored log again (resume.ts) onto a rail
// rebuilt from it (rail.ts), after the whole stored log has been verified with the stored keys (plan.ts).
//
// open() is the page's start-up. It never throws for storage reasons, and never half-restores:
//  - nothing stored: a fresh page, exactly as before;
//  - a stored session that verifies and has not ended: restored, outcome "restored";
//  - a stored session that does not (corrupt, other version, edited log, other keys, ended budget, family budget): removed,
//    a fresh page, outcome "ended" (the page says so once, in OnDeviceNote);
//  - storage that cannot be read (private mode, blocked): a plain LocalApiClient in all but name, info().remembers false;
//  - anything unforeseen in this file: the same plain client (and one line to the logger). The page always starts.
// DEMO KEYS: the engine and delegator keys are the throwaway keys the page already made and held in memory; they are now also
// kept in this storage so the same keys can sign the next entries (KEYS.md). They are SIMULATED and worth nothing outside this demo.
import type { ApiInfo } from "../../types";
import { SYSTEM_CLOCK } from "../../../booth/backend/ids";
import type { ExportView } from "../../../booth/backend/types";
import { LocalApiClient, type LocalApiClientOptions } from "../LocalApiClient";
import { planRestore, type RestorePlan } from "./plan";
import { SESSION_KEY } from "./record";
import { browserPage, SessionSaver, type PageEvents } from "./saver";
import { browserStore, readStored, removeStored, storageWorks, type StringStore } from "./storage";
import { persistWiring, type PersistWiring } from "./wiring";

export interface PersistOptions {
  /** Where the session is kept. Default: the page's localStorage. null: nowhere (blocked or missing storage). */
  readonly storage?: StringStore | null;
  /** Where the page's going away is heard. Default: the real page. null: nowhere (a test). */
  readonly page?: PageEvents | null;
}

/** What info() says about the keys while the session is kept (the base says they are new on every load). */
const KEPT_KEYS_NOTE = "Throwaway demo keys, kept in this browser until the demo is started over.";
const KEPT_PUBLIC_KEYS_NOTE = "Throwaway demo keys this page signs with, kept on this phone until the demo is started over (rail SIMULATED). Public keys only.";

/** What the page found when it started. */
export type SessionOutcome = "fresh" | "restored" | "ended";

interface Parts {
  readonly saver: SessionSaver;
  readonly wiring: PersistWiring | null;
  readonly remembers: boolean;
}

/** The agent that is in the sealed credential (the first line of the exported log), or null. */
function sealedAgent(log: string): string | null {
  try {
    const first = JSON.parse(log.slice(0, Math.max(0, log.indexOf("\n")))) as { payload?: { credentialSubject?: { id?: unknown } } };
    const id = first.payload?.credentialSubject?.id;
    return typeof id === "string" && id.startsWith("did:key:") ? id : null;
  } catch {
    return null;
  }
}

export class PersistentLocalApiClient extends LocalApiClient {
  readonly #saver: SessionSaver;
  readonly #remembers: boolean;
  #outcome: SessionOutcome = "fresh";

  private constructor(options: LocalApiClientOptions, parts: Parts) {
    super({ ...options, ...(parts.wiring ?? {}) });
    this.#saver = parts.saver;
    this.#remembers = parts.remembers;
  }

  /** The page's start-up: restore the stored session if it is good, else start fresh. See the file header. */
  static async open(options: LocalApiClientOptions & PersistOptions = {}): Promise<PersistentLocalApiClient> {
    const { storage, page, ...client } = options;
    const store = storage === undefined ? browserStore() : storage;
    const events = page === undefined ? browserPage() : page;
    try {
      return await PersistentLocalApiClient.#start(client, store, events);
    } catch (err) {
      client.logger?.error(`session: kept sessions are off for this page (${err instanceof Error ? err.message : "unknown error"})`);
      return PersistentLocalApiClient.#plain(client);
    }
  }

  static #plain(options: LocalApiClientOptions): PersistentLocalApiClient {
    const clock = options.clock ?? SYSTEM_CLOCK;
    return new PersistentLocalApiClient(options, { saver: new SessionSaver({ store: null, now: () => clock.now() }), wiring: null, remembers: false });
  }

  static async #start(options: LocalApiClientOptions, store: StringStore | null, events: PageEvents | null): Promise<PersistentLocalApiClient> {
    const clock = options.clock ?? SYSTEM_CLOCK;
    const read = readStored(store, SESSION_KEY);
    if (!read.ok) return PersistentLocalApiClient.#plain(options); // storage that cannot even be read: as before
    let ended = false;
    if (read.text !== null) {
      const planned = planRestore(read.text, clock.now());
      const restored = planned.kind === "plan" ? await PersistentLocalApiClient.#restore(options, store, events, planned.plan) : null;
      if (restored !== null) return restored;
      // The reason, for whoever is looking (never a key, never the stored text).
      options.logger?.info(`session: not restored (${planned.kind === "ended" ? `${planned.problem}${planned.detail === undefined ? "" : `: ${planned.detail}`}` : "the stored log could not be sealed again"})`);
      removeStored(store, SESSION_KEY); // what cannot be restored is not kept
      ended = true;
    }
    const fresh = PersistentLocalApiClient.#make(options, store, null);
    fresh.#outcome = ended ? "ended" : "fresh";
    if (events !== null) fresh.#saver.listen(events);
    return fresh;
  }

  static #make(options: LocalApiClientOptions, store: StringStore | null, plan: RestorePlan | null): PersistentLocalApiClient {
    const clock = options.clock ?? SYSTEM_CLOCK;
    const saver = new SessionSaver({ store, now: () => clock.now() });
    return new PersistentLocalApiClient(options, { saver, wiring: persistWiring({ plan, saver }), remembers: storageWorks(store) });
  }

  /** Seals the stored session again and checks it came back exactly; null (nothing kept of the attempt) otherwise. */
  static async #restore(options: LocalApiClientOptions, store: StringStore | null, events: PageEvents | null, plan: RestorePlan): Promise<PersistentLocalApiClient | null> {
    const attempt = PersistentLocalApiClient.#make(options, store, plan);
    try {
      // The seal's own answer, taken before any tick: a read would tick first and could append (a card that ran out while the page was closed).
      const sealed = await attempt.seal(plan.sealRequest);
      if (sealed.mandate.id !== plan.mandateId || sealed.head.seq !== plan.head.seq || sealed.head.entry_hash !== plan.head.entry_hash) throw new Error("restored session differs from the stored one");
    } catch {
      attempt.#drop();
      return null;
    }
    attempt.#outcome = "restored";
    if (events !== null) attempt.#saver.listen(events);
    return attempt;
  }

  /** "restored", "ended" (a stored session was refused and removed) or "fresh". */
  get outcome(): SessionOutcome {
    return this.#outcome;
  }

  /** True when a stored session was refused: the page says, once, that the last demo session ended. */
  get sessionEnded(): boolean {
    return this.#outcome === "ended";
  }

  /** Writes the session now if it changed (the page does this by itself when it goes away). */
  flush(): void {
    this.#saver.flush();
  }

  /** `remembers`: this page keeps the session until it is started over (About says so only then), and the keys note says the keys are kept. */
  override async info(): Promise<ApiInfo> {
    const info = await super.info();
    return { ...info, remembers: this.#remembers, ...(this.#remembers && "keys" in info ? { keys: KEPT_KEYS_NOTE } : {}) };
  }

  /**
   * The base export names a throwaway agent id made for the seal that was thrown away on a restore; the sealed credential's
   * is the real one. The note on the keys says they are kept, when they are.
   */
  override async exportLog(): Promise<ExportView> {
    const view = await super.exportLog();
    const agent = sealedAgent(view.log) ?? view.publicKeys.agent;
    const note = this.#remembers ? KEPT_PUBLIC_KEYS_NOTE : view.publicKeys.note;
    return agent === view.publicKeys.agent && note === view.publicKeys.note ? view : { ...view, publicKeys: { ...view.publicKeys, agent, note } };
  }

  /** Start over: the stored session goes. The fresh budget the reset seals is not kept until something happens in it. */
  override async reset(): Promise<void> {
    this.#saver.suspend();
    try {
      await super.reset();
    } catch (err) {
      this.#saver.resume(true); // the old session goes on, so it keeps being saved
      throw err;
    }
    this.#saver.clear();
    this.#saver.resume(false);
  }

  /** Writes the last change, stops listening and stops the clock. */
  override dispose(): void {
    this.#saver.flush();
    this.#saver.dispose();
    super.dispose();
  }

  /** A failed restore attempt: gone without a write. */
  #drop(): void {
    this.#saver.dispose();
    super.dispose();
  }
}
