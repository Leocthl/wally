// The saver: keeps the stored session equal to the session in the page, without ever getting in the way of it.
//  - After the log changed it waits a moment (SAVE_DEBOUNCE_MS) and writes once, so a burst of appends is one write.
//  - When the page goes away (pagehide, or hidden: the last chance on a phone) it writes at once, synchronously.
//  - It reads the entries only when it writes, from the store's own mirror (store.ts), never from a view: a tamper demo's
//    changed copy is a view, so it can never be saved.
//  - A save that cannot be made removes what was stored. A record that is out of date is worse than none: restoring it
//    would quietly undo a purchase or a cancel. The page then starts fresh next time and says so.
//  - A family budget is never saved (plan.ts says why): the record of the budget before it is replaced by a marker, so the
//    next start says the last session ended rather than starting fresh in silence.
//  - A reset suspends it: the fresh budget the reset seals is not worth keeping, and the old record goes (client).
// Several tabs: each tab writes its own whole session, the last writer wins, and a `storage` event from another tab is not
// listened to (no live merging). Nothing here throws; a failed write is a removal, never an error for the shopper.
import { checkpointOf, toJsonl } from "@wally/core/log";
import type { LogEntry } from "@wally/core/generated";
import type { KeyFiles } from "./keys";
import { credentialIsFamily } from "./plan";
import { encodeRecord, NOT_KEPT_MARKER, SESSION_KEY } from "./record";
import { removeStored, writeStored, type StringStore } from "./storage";

/** How long after a change the session is written ("about 300 ms"; UI only, ASSUMED: no register row). */
export const SAVE_DEBOUNCE_MS = 300;

/** What there is to save: the keys that signed the log and a way to read the log as it is now. */
export interface SaveSource {
  readonly files: KeyFiles;
  readonly entries: () => readonly LogEntry[];
}

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Where the saver hears that the page is going away. Either may be missing (a worker, a test). */
export interface PageEvents {
  readonly window: Listenable | null;
  readonly document: (Listenable & { readonly visibilityState: string }) | null;
}

/** The real page, where there is one. */
export function browserPage(): PageEvents {
  return { window: typeof window === "undefined" ? null : window, document: typeof document === "undefined" ? null : document };
}

export interface SaverOptions {
  readonly store: StringStore | null;
  readonly now: () => Date;
  /** Default SAVE_DEBOUNCE_MS. */
  readonly delayMs?: number;
}

export class SessionSaver {
  readonly #store: StringStore | null;
  readonly #now: () => Date;
  readonly #delayMs: number;
  #source: SaveSource | null = null;
  #dirty = false;
  #suspended = false;
  #disposed = false;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #detach: (() => void) | null = null;

  constructor(options: SaverOptions) {
    this.#store = options.store;
    this.#now = options.now;
    this.#delayMs = options.delayMs ?? SAVE_DEBOUNCE_MS;
  }

  /** The session changed: it is written after a short pause (not while a reset is running). */
  changed(source: SaveSource): void {
    if (this.#disposed) return;
    this.#source = source;
    this.#dirty = true;
    if (!this.#suspended) this.#arm();
  }

  /** Writes now if something changed since the last write. */
  flush(): void {
    this.#cancel();
    const source = this.#source;
    if (this.#disposed || this.#suspended || !this.#dirty || source === null) return;
    this.#dirty = false; // one attempt per change: a session that cannot be saved is not retried until it changes again
    const text = this.#text(source);
    if (text === null || !writeStored(this.#store, SESSION_KEY, text)) removeStored(this.#store, SESSION_KEY);
  }

  /** Forgets the stored session and anything waiting to be written. */
  clear(): void {
    this.#cancel();
    this.#source = null;
    this.#dirty = false;
    removeStored(this.#store, SESSION_KEY);
  }

  /** A reset starts: changes are noted but not written. */
  suspend(): void {
    this.#suspended = true;
    this.#cancel();
  }

  /** The reset is over. `save`: write what was held back (the reset failed and the session goes on); otherwise drop it. */
  resume(save: boolean): void {
    this.#suspended = false;
    if (save && this.#dirty) this.#arm();
    else this.#dirty = false;
  }

  /** Writes when the page goes away: pagehide, or the page being hidden (a phone app switch, a tab change). */
  listen(page: PageEvents): void {
    this.#detach?.();
    const gone = (): void => this.flush();
    const hidden = (): void => {
      if (page.document?.visibilityState === "hidden") this.flush();
    };
    page.window?.addEventListener("pagehide", gone);
    page.document?.addEventListener("visibilitychange", hidden);
    this.#detach = () => {
      page.window?.removeEventListener("pagehide", gone);
      page.document?.removeEventListener("visibilitychange", hidden);
    };
  }

  /** Stops listening and writing. Does not write (flush first to keep the last change). */
  dispose(): void {
    this.#disposed = true;
    this.#cancel();
    this.#detach?.();
    this.#detach = null;
  }

  #arm(): void {
    if (this.#timer === null) {
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.flush();
      }, this.#delayMs);
    }
  }

  #cancel(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** The record's text, the not-kept marker for a family budget, or null when there is nothing to keep (empty, too long). */
  #text(source: SaveSource): string | null {
    try {
      const entries = source.entries();
      const first = entries[0];
      const last = entries.at(-1);
      if (first === undefined || last === undefined || first.kind !== "MANDATE_SEALED") return null;
      if (credentialIsFamily(first.payload)) return NOT_KEPT_MARKER;
      const result = encodeRecord({ savedAt: this.#now(), keys: source.files, log: toJsonl(entries), head: checkpointOf(last) });
      return result.ok ? result.text : null;
    } catch {
      return null; // whatever went wrong, no record is better than a wrong one
    }
  }
}
