// The profile store (state/profile.ts): what is kept on this device, how it is read back (versioned key, corrupt data,
// storage that throws in private mode), and that the "onboarded" flag and the profile never mix up.
import { describe, expect, it, vi } from "vitest";
import {
  createProfileStore,
  emptyProfile,
  isEmptyProfile,
  MAX_NICKNAME,
  mergeProfile,
  normaliseNickname,
  ONBOARDED_KEY,
  parseProfile,
  PROFILE_KEY,
  profileSummary,
  serialiseProfile,
  type Profile,
  type ProfileStorage,
} from "../src/state/profile";

class FakeStorage implements ProfileStorage {
  readonly data = new Map<string, string>();
  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [k, v] of Object.entries(initial)) this.data.set(k, v);
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** Private mode in some browsers: every call throws. */
class ThrowingStorage implements ProfileStorage {
  getItem(): string | null {
    throw new DOMException("denied", "SecurityError");
  }
  setItem(): void {
    throw new DOMException("quota", "QuotaExceededError");
  }
  removeItem(): void {
    throw new DOMException("denied", "SecurityError");
  }
}

/** Reads work, writes fail (full or read-only storage). */
class ReadOnlyStorage extends FakeStorage {
  override setItem(): void {
    throw new DOMException("quota", "QuotaExceededError");
  }
  override removeItem(): void {
    throw new DOMException("quota", "QuotaExceededError");
  }
}

const mei: Profile = {
  ...emptyProfile(),
  nickname: "Mei",
  styles: ["basics", "streetwear"],
  colours: ["black", "olive"],
  sizes: { top: "M", bottom: "S", shoe: "38" },
  shopFor: ["apparel", "footwear"],
};

describe("normaliseNickname", () => {
  it("trims, folds width and spacing, and drops control characters", () => {
    expect(normaliseNickname("  Mei  ")).toBe("Mei");
    expect(normaliseNickname("Mei\u0000\u0007 Lee")).toBe("Mei Lee");
    expect(normaliseNickname("Ｍｅｉ")).toBe("Mei");
    expect(normaliseNickname("Mei \t\n  Lee")).toBe("Mei Lee");
  });

  it("keeps Chinese names and cuts long ones by character, not by byte", () => {
    expect(normaliseNickname("小美")).toBe("小美");
    const long = "美".repeat(MAX_NICKNAME + 10);
    expect(Array.from(normaliseNickname(long))).toHaveLength(MAX_NICKNAME);
  });

  it("is empty for anything that is not text", () => {
    expect(normaliseNickname(undefined)).toBe("");
    expect(normaliseNickname(42)).toBe("");
    expect(normaliseNickname("   ")).toBe("");
  });
});

describe("parseProfile", () => {
  it("reads back what serialiseProfile wrote", () => {
    expect(parseProfile(serialiseProfile(mei))).toEqual(mei);
  });

  it("is null for nothing, for text that is not JSON, and for JSON that is not an object", () => {
    for (const raw of [null, "", "not json", "[]", "42", "null", '"mei"', "{"]) expect(parseProfile(raw), String(raw)).toBeNull();
  });

  it("is null for another version (a newer or older shape is ignored, never guessed at)", () => {
    expect(parseProfile(JSON.stringify({ ...mei, v: 2 }))).toBeNull();
    expect(parseProfile(JSON.stringify({ ...mei, v: 0 }))).toBeNull();
    const { v: _v, ...noVersion } = mei;
    expect(parseProfile(JSON.stringify(noVersion))).toBeNull();
  });

  it("drops ids it does not know, repeats, and wrong types, and keeps the rest in catalogue order", () => {
    const raw = JSON.stringify({
      v: 1,
      nickname: 7,
      styles: ["cozy", "punk", "basics", "cozy", 5],
      colours: "black",
      sizes: { top: "XXL", bottom: "L", shoe: 38 },
      shopFor: ["footwear", "weapons", "apparel"],
      extra: "<script>alert(1)</script>",
    });
    expect(parseProfile(raw)).toEqual({
      v: 1,
      nickname: "",
      styles: ["basics", "cozy"],
      colours: [],
      sizes: { top: null, bottom: "L", shoe: null },
      shopFor: ["apparel", "footwear"],
    });
  });

  it("never carries a key it does not own", () => {
    const parsed = parseProfile(JSON.stringify({ ...mei, extra: "x", __proto__: { admin: true } }));
    expect(Object.keys(parsed ?? {}).sort()).toEqual(["colours", "nickname", "shopFor", "sizes", "styles", "v"]);
  });

  it("is null when nothing usable is left", () => {
    expect(parseProfile(JSON.stringify({ v: 1, nickname: "  ", styles: ["punk"] }))).toBeNull();
  });
});

describe("mergeProfile and isEmptyProfile", () => {
  it("returns a new profile and leaves the old one alone", () => {
    const frozen = Object.freeze({ ...mei, styles: Object.freeze([...mei.styles]) }) as Profile;
    const next = mergeProfile(frozen, { nickname: "Jo", shopFor: ["groceries"] });
    expect(next).not.toBe(frozen);
    expect(next).toMatchObject({ nickname: "Jo", shopFor: ["groceries"], styles: ["basics", "streetwear"] });
    expect(frozen.nickname).toBe("Mei");
  });

  it("starts from an empty profile when there is none", () => {
    expect(mergeProfile(null, { nickname: "Jo" })).toEqual({ ...emptyProfile(), nickname: "Jo" });
  });

  it("cleans what it is given with the same rules as a read", () => {
    expect(mergeProfile(null, { nickname: "  Jo  ", styles: ["cozy", "cozy"] })).toMatchObject({ nickname: "Jo", styles: ["cozy"] });
  });

  it("knows an empty profile", () => {
    expect(isEmptyProfile(emptyProfile())).toBe(true);
    expect(isEmptyProfile(mergeProfile(null, { sizes: { top: null, bottom: null, shoe: "40" } }))).toBe(false);
    expect(isEmptyProfile(mei)).toBe(false);
  });
});

describe("profileSummary", () => {
  it("lists the nickname and the styles, and is empty for a profile with neither", () => {
    expect(profileSummary(mei)).toEqual({ nickname: "Mei", styles: ["basics", "streetwear"] });
    expect(profileSummary(mergeProfile(null, { colours: ["navy"] }))).toEqual({ nickname: "", styles: [] });
  });
});

describe("profile store", () => {
  it("starts with nothing and not onboarded", () => {
    const store = createProfileStore(() => new FakeStorage());
    expect(store.profile()).toBeNull();
    expect(store.onboarded()).toBe(false);
  });

  it("saves under the versioned key and gives the same object until it changes", () => {
    const storage = new FakeStorage();
    const store = createProfileStore(() => storage);
    store.save(mei);
    expect(PROFILE_KEY).toBe("wally:profile:v1");
    expect(JSON.parse(storage.data.get(PROFILE_KEY) ?? "null")).toEqual(mei);
    const first = store.profile();
    expect(first).toEqual(mei);
    expect(store.profile()).toBe(first);
    store.save(mergeProfile(mei, { nickname: "Jo" }));
    expect(store.profile()).not.toBe(first);
    expect(store.profile()?.nickname).toBe("Jo");
  });

  it("reads what an earlier page load saved", () => {
    const store = createProfileStore(() => new FakeStorage({ [PROFILE_KEY]: serialiseProfile(mei) }));
    expect(store.profile()).toEqual(mei);
  });

  it("treats corrupt stored data as no profile, without throwing, and replaces it on the next save", () => {
    const storage = new FakeStorage({ [PROFILE_KEY]: "{{{ not json" });
    const store = createProfileStore(() => storage);
    expect(store.profile()).toBeNull();
    store.save(mei);
    expect(store.profile()).toEqual(mei);
  });

  it("saving an empty profile or null removes the key", () => {
    const storage = new FakeStorage({ [PROFILE_KEY]: serialiseProfile(mei) });
    const store = createProfileStore(() => storage);
    store.save(emptyProfile());
    expect(storage.data.has(PROFILE_KEY)).toBe(false);
    expect(store.profile()).toBeNull();
    store.save(mei);
    store.save(null);
    expect(storage.data.has(PROFILE_KEY)).toBe(false);
  });

  it("forget removes the profile and nothing else", () => {
    const storage = new FakeStorage({ [PROFILE_KEY]: serialiseProfile(mei), [ONBOARDED_KEY]: "1", "wally:lang": "zh-HK" });
    const store = createProfileStore(() => storage);
    store.forget();
    expect(store.profile()).toBeNull();
    expect(store.onboarded()).toBe(true);
    expect(storage.data.get("wally:lang")).toBe("zh-HK");
  });

  it("marks onboarded with the exact flag value 1, and reads only that value", () => {
    const storage = new FakeStorage();
    const store = createProfileStore(() => storage);
    store.markOnboarded();
    expect(ONBOARDED_KEY).toBe("wally:onboarded");
    expect(storage.data.get(ONBOARDED_KEY)).toBe("1");
    expect(store.onboarded()).toBe(true);
    for (const other of ["0", "true", "", "yes"]) expect(createProfileStore(() => new FakeStorage({ [ONBOARDED_KEY]: other })).onboarded(), other).toBe(false);
  });

  it("notifies subscribers on save, forget and markOnboarded, and stops after unsubscribe", () => {
    const store = createProfileStore(() => new FakeStorage());
    const seen = vi.fn();
    const off = store.subscribe(seen);
    store.save(mei);
    store.forget();
    store.markOnboarded();
    expect(seen).toHaveBeenCalledTimes(3);
    off();
    store.save(mei);
    expect(seen).toHaveBeenCalledTimes(3);
  });

  it("hears a change made in another tab (storage event) and re-reads", () => {
    const storage = new FakeStorage();
    const store = createProfileStore(() => storage);
    const seen = vi.fn();
    const off = store.subscribe(seen);
    storage.data.set(PROFILE_KEY, serialiseProfile(mei));
    window.dispatchEvent(new StorageEvent("storage", { key: PROFILE_KEY }));
    expect(seen).toHaveBeenCalled();
    expect(store.profile()).toEqual(mei);
    off();
  });

  it("refresh drops what the page held after a failed write and reads storage again", () => {
    const storage = new ReadOnlyStorage({ [PROFILE_KEY]: serialiseProfile(mei) });
    const store = createProfileStore(() => storage);
    store.save(mergeProfile(mei, { nickname: "Jo" }));
    store.markOnboarded();
    expect(store.profile()?.nickname).toBe("Jo");
    expect(store.onboarded()).toBe(true);
    const seen = vi.fn();
    store.subscribe(seen);
    store.refresh();
    expect(store.profile()?.nickname).toBe("Mei");
    expect(store.onboarded()).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  describe("private mode: storage that throws", () => {
    it("reads as empty and not onboarded, without throwing", () => {
      const store = createProfileStore(() => new ThrowingStorage());
      expect(store.profile()).toBeNull();
      expect(store.onboarded()).toBe(false);
    });

    it("keeps the profile and the flag for this page when it cannot write", () => {
      const store = createProfileStore(() => new ThrowingStorage());
      const seen = vi.fn();
      store.subscribe(seen);
      expect(() => store.save(mei)).not.toThrow();
      expect(store.profile()).toEqual(mei);
      expect(() => store.markOnboarded()).not.toThrow();
      expect(store.onboarded()).toBe(true);
      expect(() => store.forget()).not.toThrow();
      expect(store.profile()).toBeNull();
      expect(seen).toHaveBeenCalledTimes(3);
    });

    it("works when the storage object itself is missing or its getter throws", () => {
      const missing = createProfileStore(() => null);
      missing.save(mei);
      expect(missing.profile()).toEqual(mei);
      const getter = createProfileStore(() => {
        throw new DOMException("denied", "SecurityError");
      });
      getter.save(mei);
      expect(getter.profile()).toEqual(mei);
      getter.markOnboarded();
      expect(getter.onboarded()).toBe(true);
    });

    it("a write that fails still shows the new profile, and a later read does not bring the old one back", () => {
      const storage = new ReadOnlyStorage({ [PROFILE_KEY]: serialiseProfile(mei) });
      const store = createProfileStore(() => storage);
      expect(store.profile()).toEqual(mei);
      store.save(mergeProfile(mei, { nickname: "Jo" }));
      expect(store.profile()?.nickname).toBe("Jo");
      store.forget();
      expect(store.profile()).toBeNull();
    });
  });
});
