// PWA state shared by register.ts (which fills it) and the install and update UI (which reads it). A tiny external
// store: immutable snapshots, subscribe for useSyncExternalStore. No React import here so register.ts stays light.

/** Chrome and Edge fire this before showing their own install prompt; we keep it to offer "Install Wally" later. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  readonly installEvent: InstallPromptEvent | null;
  readonly installed: boolean;
  readonly updateReady: boolean;
  /** Set while a waiting worker exists, so "Reload" can tell it to take over. */
  readonly waiting: ServiceWorker | null;
}

export const INITIAL_PWA: PwaState = { installEvent: null, installed: false, updateReady: false, waiting: null };

let state: PwaState = INITIAL_PWA;
const listeners = new Set<() => void>();

export function getPwa(): PwaState {
  return state;
}

export function setPwa(patch: Partial<PwaState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests only: back to the initial snapshot. */
export function resetPwa(): void {
  state = INITIAL_PWA;
  for (const l of listeners) l();
}
