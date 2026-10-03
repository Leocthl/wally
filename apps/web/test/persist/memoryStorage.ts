// A localStorage stand-in for the persistence tests, with failures a browser can show: blocked, full, throwing.
import type { StringStore } from "../../src/api/local/persist/storage";

/** A localStorage stand-in. `fail` names the calls that throw, like a browser that is blocked or full. */
export class MemoryStorage implements StringStore {
  readonly items = new Map<string, string>();
  fail: { readonly get?: boolean; readonly set?: boolean; readonly remove?: boolean } = {};
  writes = 0;

  getItem(key: string): string | null {
    if (this.fail.get === true) throw new DOMException("blocked", "SecurityError");
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.fail.set === true) throw new DOMException("full", "QuotaExceededError");
    this.writes += 1;
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    if (this.fail.remove === true) throw new DOMException("blocked", "SecurityError");
    this.items.delete(key);
  }
}
