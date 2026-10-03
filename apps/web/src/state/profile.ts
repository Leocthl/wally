// The profile: what Wally knows about the person, kept on this device only (localStorage, never sent anywhere). Reads
// are strict (a version, known ids, a short plain nickname; anything else is dropped), and a browser that will not let the
// page write (private mode, full storage) still works for the page: the store keeps its own copy until the page closes.
// The "onboarded" flag lives beside it: one key, one value, so tests and the video can switch the first run off.
import { COLOUR_IDS, SHOE_SIZES, SHOP_IDS, SIZE_LETTERS, STYLE_IDS, type ColourId, type ShoeSize, type ShopId, type SizeLetter, type StyleId } from "./taste";

export const PROFILE_VERSION = 1 as const;
/** The key carries the version too, so a later shape can sit beside this one and nothing is ever half-read. */
export const PROFILE_KEY = "wally:profile:v1";
export const ONBOARDED_KEY = "wally:onboarded";
/** A nickname is a name to greet, not a paragraph (counted in characters, so a Chinese name is not cut short). */
export const MAX_NICKNAME = 24;

export interface Sizes {
  readonly top: SizeLetter | null;
  readonly bottom: SizeLetter | null;
  readonly shoe: ShoeSize | null;
}

export interface Profile {
  readonly v: typeof PROFILE_VERSION;
  /** "" when the person gave none. */
  readonly nickname: string;
  readonly styles: readonly StyleId[];
  readonly colours: readonly ColourId[];
  readonly sizes: Sizes;
  readonly shopFor: readonly ShopId[];
}

export type ProfilePatch = Partial<Omit<Profile, "v">>;

export const EMPTY_SIZES: Sizes = { top: null, bottom: null, shoe: null };

export function emptyProfile(): Profile {
  return { v: PROFILE_VERSION, nickname: "", styles: [], colours: [], sizes: EMPTY_SIZES, shopFor: [] };
}

export function isEmptyProfile(p: Profile): boolean {
  return p.nickname === "" && p.styles.length === 0 && p.colours.length === 0 && p.shopFor.length === 0 && p.sizes.top === null && p.sizes.bottom === null && p.sizes.shoe === null;
}

/** NFKC, no control or invisible characters, single spaces, at most MAX_NICKNAME characters. Anything but text is "". */
export function normaliseNickname(value: unknown): string {
  if (typeof value !== "string") return "";
  const plain = value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  return Array.from(plain).slice(0, MAX_NICKNAME).join("").trim();
}

/** The ids in `allowed` that the value lists, in `allowed` order: unknown ids, repeats and wrong types fall away. */
function pickIds<T extends string>(value: unknown, allowed: readonly T[]): readonly T[] {
  return Array.isArray(value) ? allowed.filter((id) => value.includes(id)) : [];
}

function pickOne<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((id) => id === value) ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Every field cleaned with the rules of a read. Builds a new object from known keys only. */
function cleaned(source: Readonly<Record<string, unknown>>): Profile {
  const sizes = isRecord(source["sizes"]) ? source["sizes"] : {};
  return {
    v: PROFILE_VERSION,
    nickname: normaliseNickname(source["nickname"]),
    styles: pickIds(source["styles"], STYLE_IDS),
    colours: pickIds(source["colours"], COLOUR_IDS),
    sizes: { top: pickOne(sizes["top"], SIZE_LETTERS), bottom: pickOne(sizes["bottom"], SIZE_LETTERS), shoe: pickOne(sizes["shoe"], SHOE_SIZES) },
    shopFor: pickIds(source["shopFor"], SHOP_IDS),
  };
}

/** What is stored, read strictly: null for nothing, for broken text, for another version, and for a profile with nothing in it. */
export function parseProfile(raw: string | null): Profile | null {
  if (raw === null || raw === "") return null;
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
  const { v, nickname, styles, colours, sizes, shopFor } = p;
  return JSON.stringify({ v, nickname, styles, colours, sizes, shopFor });
}

/** A new profile with the patch laid over `base` (or over nothing), cleaned like a read. The inputs are not touched. */
export function mergeProfile(base: Profile | null, patch: ProfilePatch): Profile {
  return cleaned({ ...(base ?? emptyProfile()), ...patch });
}

/** The two things the rest of the app reads out loud: the name to greet and the styles to lean on. */
export function profileSummary(p: Profile): { readonly nickname: string; readonly styles: readonly StyleId[] } {
  return { nickname: p.nickname, styles: p.styles };
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
  /** null, or a profile with nothing in it, removes the stored profile. */
  save(profile: Profile | null): void;
  /** Removes the profile and nothing else (the first-run flag, language and theme stay). */
  forget(): void;
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

  function writeRaw(raw: string | null): void {
    try {
      const target = storage();
      if (target === null) throw new Error("no storage");
      if (raw === null) target.removeItem(PROFILE_KEY);
      else target.setItem(PROFILE_KEY, raw);
      held = null;
    } catch {
      held = { raw };
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
      writeRaw(next === null || isEmptyProfile(next) ? null : serialiseProfile(next));
      notify();
    },
    forget() {
      writeRaw(null);
      notify();
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
