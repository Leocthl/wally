// React side of the profile: read it, change it, forget it. The store is the device's localStorage (state/profile.ts), so
// every component that reads it stays in step, with no provider to mount. Without a profile everything reads as before.
import { useCallback, useSyncExternalStore } from "react";
import { UI } from "../i18n/ui";
import { ASK_EXAMPLES } from "../i18n/onboarding";
import { useLocale } from "../ui/locale";
import { mergeProfile, profileStore, type Profile, type ProfilePatch } from "./profile";
import { SHOP_PICKS, STYLE_PICKS } from "./taste";

export interface ProfileApi {
  readonly profile: Profile | null;
  /** Lays the patch over the saved profile and keeps it. */
  readonly save: (patch: ProfilePatch) => void;
  /** Removes the profile from this device. */
  readonly forget: () => void;
}

const subscribe = profileStore.subscribe;
const read = (): Profile | null => profileStore.profile();
const server = (): Profile | null => null;

export function useProfile(): ProfileApi {
  const profile = useSyncExternalStore(subscribe, read, server);
  const save = useCallback((patch: ProfilePatch) => profileStore.save(mergeProfile(profileStore.profile(), patch)), []);
  const forget = useCallback(() => profileStore.forget(), []);
  return { profile, save, forget };
}

/** The name to greet, or "" when the person gave none. */
export function useNickname(): string {
  return useProfile().profile?.nickname ?? "";
}

/**
 * The words in the Ask field's placeholder. The booth's example, unless the person's taste points at an item the shelf
 * has (a denim jacket, a fleece hoodie): then that item, so the example is something Wally can really shop for.
 */
export function useAskExample(): string {
  const { t } = useLocale();
  const { profile } = useProfile();
  const picks = profile === null ? [] : [...profile.styles.flatMap((s) => STYLE_PICKS[s]), ...profile.shopFor.flatMap((s) => SHOP_PICKS[s] ?? [])];
  for (const id of picks) {
    const example = ASK_EXAMPLES[id];
    if (example !== undefined && id !== "normal") return t(example);
  }
  return t(UI["shell.askExample"]);
}
