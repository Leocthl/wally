// The browser's storage seen through try/catch. A page whose storage is blocked (private mode, site data off, a getter
// that throws), full or missing works exactly as it did before sessions were kept: every call here reports and never throws.
// The slice of Storage the session uses; the real localStorage satisfies it, and so does a test double.
export interface StringStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The page's own localStorage, or null when the browser denies it or there is no window. */
export function browserStore(): StringStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** `text` is null when nothing is stored under the key; ok: false means the storage itself could not be read. */
export type ReadResult = { readonly ok: true; readonly text: string | null } | { readonly ok: false };

export function readStored(store: StringStore | null, key: string): ReadResult {
  if (store === null) return { ok: false };
  try {
    return { ok: true, text: store.getItem(key) };
  } catch {
    return { ok: false };
  }
}

/** True when the browser took the write. */
export function writeStored(store: StringStore | null, key: string, text: string): boolean {
  if (store === null) return false;
  try {
    store.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

/** True when the browser took the removal (a key that was not there counts). */
export function removeStored(store: StringStore | null, key: string): boolean {
  if (store === null) return false;
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const PROBE_KEY = "wally:session:probe";

/** Whether a small value can be written, read back and removed here. Leaves nothing behind. */
export function storageWorks(store: StringStore | null): boolean {
  if (!writeStored(store, PROBE_KEY, "1")) return false;
  const back = readStored(store, PROBE_KEY);
  return removeStored(store, PROBE_KEY) && back.ok && back.text === "1";
}
