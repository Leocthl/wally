// How persistence plugs into the on-device composition (compose.ts) without the composition knowing about it: the keys each
// session uses (the stored ones for the first session of a restore, new ones otherwise, always with their stored form), and
// each session's log store (the saving one, or the resuming one for a restore). Two options, nothing else changes.
import type { DemoKeys } from "../../../booth/backend/keys";
import type { LocalComposeOptions } from "../compose";
import { newKeyMaterial, type KeyFiles } from "./keys";
import type { RestorePlan } from "./plan";
import { resumeDeps } from "./resume";
import type { SessionSaver } from "./saver";
import { SessionLogStore } from "./store";

export type PersistWiring = Required<Pick<LocalComposeOptions, "keys" | "wrapSession">>;

/** `plan`: the stored session the first session resumes; null for a page with nothing to restore. */
export function persistWiring(input: { readonly plan: RestorePlan | null; readonly saver: SessionSaver }): PersistWiring {
  const filesOf = new WeakMap<DemoKeys, KeyFiles>();
  const planOf = new WeakMap<DemoKeys, RestorePlan>();
  let pending = input.plan; // the first session only: a reset or a later seal under new keys is a new session
  return {
    keys: () => {
      if (pending !== null) {
        const plan = pending;
        pending = null;
        filesOf.set(plan.keys, plan.files);
        planOf.set(plan.keys, plan);
        return plan.keys;
      }
      const material = newKeyMaterial();
      filesOf.set(material.keys, material.files);
      return material.keys;
    },
    wrapSession: (deps, keys) => {
      const files = filesOf.get(keys);
      const plan = planOf.get(keys);
      const store: SessionLogStore = new SessionLogStore({
        ...(plan === undefined ? {} : { resume: plan.entries }),
        onAppend: (logId) => {
          if (files !== undefined) input.saver.changed({ files, entries: () => store.entriesOf(logId) });
        },
      });
      const next = { ...deps, store };
      return plan === undefined ? next : resumeDeps(next, plan);
    },
  };
}
