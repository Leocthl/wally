// The profile: what Wally knows about the person, kept on this device only (localStorage, never sent anywhere). Reads
// are strict (a version, known ids, a short plain nickname; anything else is dropped), and a browser that will not let the
// page write (private mode, full storage) still works for the page: the store keeps its own copy until the page closes.
// The "onboarded" flag lives beside it: one key, one value, so tests and the video can switch the first run off.
import { SHOP_IDS, type ShopId } from "./shopping";

export const PROFILE_VERSION = 1 as const;
/** The key carries the version too, so a later shape can sit beside this one and nothing is ever half-read. */
export const PROFILE_KEY = "wally:profile:v1";
export const ONBOARDED_KEY = "wally:onboarded";
/** A nickname is a name to greet, not a paragraph (counted in characters, so a Chinese name is not cut short). */
export const MAX_NICKNAME = 24;
/** Only the start of a longer value is read: more than this is not a nickname, and reading it all would cost for nothing. */
const MAX_NICKNAME_READ = 256;
/** A profile Wally wrote is a few hundred characters. Stored text far past this was put there by something else. */
const MAX_STORED_PROFILE = 4096;

/**
 * What a first-run visitor told Wally. The first version of this profile also held styles, colours and sizes; those keys are
 * still in some browsers' storage, and a read ignores them (it builds the profile from the keys it owns), so the nickname and
 * the categories survive and nothing else is read back. The next save writes the shorter shape.
 */
export interface Profile {
  readonly v: typeof PROFILE_VERSION;
  /** "" when the person gave none. */
  readonly nickname: string;
  /** The categories the person narrowed their shopping to. [] means they did not narrow it: anything. */
  readonly shopFor: readonly ShopId[];
}

export type ProfilePatch = Partial<Omit<Profile, "v">>;

export function emptyProfile(): Profile {
  return { v: PROFILE_VERSION, nickname: "", shopFor: [] };
}

export function isEmptyProfile(p: Profile): boolean {
  return p.nickname === "" && p.shopFor.length === 0;
}

/** Control and format characters, and the fillers that draw nothing (Hangul fillers, the braille blank). */
const INVISIBLE = /[\p{Cc}\p{Cf}\u115F\u1160\u2800]/gu;
/** A letter, a number, punctuation or a symbol: something a person can see. Marks and spaces alone are not a name. */
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;

/** NFKC, no control or invisible characters, single spaces, at most MAX_NICKNAME characters. Anything but text, or text with nothing to see, is "". */
export function normaliseNickname(value: unknown): string {
  if (typeof value !== "string") return "";
  const plain = value.slice(0, MAX_NICKNAME_READ).normalize("NFKC").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  const name = Array.from(plain).slice(0, MAX_NICKNAME).join("").trim();
  return VISIBLE.test(name) ? name : "";
}

/** The ids in `allowed` that the value lists, in `allowed` order: unknown ids, repeats and wrong types fall away. */
function pickIds<T extends string>(value: unknown, allowed: readonly T[]): readonly T[] {
  return Array.isArray(value) ? allowed.filter((id) => value.includes(id)) : [];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Every field cleaned with the rules of a read. Builds a new object from known keys only (old styles, colours and sizes fall away here). */
function cleaned(source: Readonly<Record<string, unknown>>): Profile {
  return {
    v: PROFILE_VERSION,
    nickname: normaliseNickname(source["nickname"]),
    shopFor: pickIds(source["shopFor"], SHOP_IDS),
  };
}

/** What is stored, read strictly: null for nothing, for broken text, for another version, and for a profile with nothing in it. */
export function parseProfile(raw: string | null): Profile | null {
  if (raw === null || raw === "" || raw.length > MAX_STORED_PROFILE) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value["v"] !== PROFILE_VERSION) return null;
  const profile = cleaned(value);
  return isEmptyProfile(profile) ? null : profile;
}

export function serialiseProfile(p: Profile): string {
  const { v, nickname, shopFor } = p;
  return JSON.stringify({ v, nickname, shopFor });
}

/** A new profile with the patch laid over `base` (or over nothing), cleaned like a read. The inputs are not touched. */
export function mergeProfile(base: Profile | null, patch: ProfilePatch): Profile {
  return cleaned({ ...(base ?? emptyProfile()), ...patch });
}

/** The slice of Storage the store uses; the real one satisfies it. */
export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProfileStore {
  /** The same object until the profile changes, so React can compare it. */
  profile(): Profile | null;
  /** null, or a profile with nothing in it, removes the stored profile. True when the browser took the write. */
  save(profile: Profile | null): boolean;
  /**
   * Removes the profile and nothing else (the first-run flag, language and theme stay). True when the browser took the
   * removal; false means this page hides the profile but it is still stored and comes back when the page is reloaded.
   */
  forget(): boolean;
  onboarded(): boolean;
  markOnboarded(): void;
  /** Drops the page's own copy of a write that failed and reads storage again (a tab changed it; a test starts clean). */
  refresh(): void;
  subscribe(listener: () => void): () => void;
}

/** `getStorage` is called on every use: a browser can deny the storage object itself (a throwing getter) or give none. */
export function createProfileStore(getStorage: () => ProfileStorage | null): ProfileStore {
  const listeners = new Set<() => void>();
  /** Set when a write failed: this page's own copy of the stored text (null = removed) wins over storage until a tab changes it. */
  let held: { readonly raw: string | null } | null = null;
  let heldOnboarded = false;
  let cache: { readonly raw: string | null; readonly profile: Profile | null } | null = null;

  const storage = (): ProfileStorage | null => {
    try {
      return getStorage();
    } catch {
      return null;
    }
  };
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  function rawProfile(): string | null {
    if (held !== null) return held.raw;
    try {
      return storage()?.getItem(PROFILE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  /** Whether the browser took the write; when it did not, this page keeps its own copy. */
  function writeRaw(raw: string | null): boolean {
    try {
      const target = storage();
      if (target === null) throw new Error("no storage");
      if (raw === null) target.removeItem(PROFILE_KEY);
      else target.setItem(PROFILE_KEY, raw);
      held = null;
      return true;
    } catch {
      held = { raw };
      return false;
    }
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== PROFILE_KEY && event.key !== ONBOARDED_KEY) return;
    if (event.key === null || event.key === PROFILE_KEY) held = null;
    notify();
  };

  return {
    profile() {
      const raw = rawProfile();
      if (cache !== null && cache.raw === raw) return cache.profile;
      const profile = parseProfile(raw);
      cache = { raw, profile };
      return profile;
    },
    save(next) {
      const kept = writeRaw(next === null || isEmptyProfile(next) ? null : serialiseProfile(next));
      notify();
      return kept;
    },
    forget() {
      const gone = writeRaw(null);
      notify();
      return gone;
    },
    onboarded() {
      if (heldOnboarded) return true;
      try {
        return storage()?.getItem(ONBOARDED_KEY) === "1";
      } catch {
        return false;
      }
    },
    markOnboarded() {
      try {
        const target = storage();
        if (target === null) throw new Error("no storage");
        target.setItem(ONBOARDED_KEY, "1");
      } catch {
        heldOnboarded = true;
      }
      notify();
    },
    refresh() {
      held = null;
      heldOnboarded = false;
      cache = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
}

/** The page's own localStorage, or null when the browser denies it. */
export function browserStorage(): ProfileStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The store the app uses. Tests make their own with createProfileStore. */
export const profileStore: ProfileStore = createProfileStore(browserStorage);
