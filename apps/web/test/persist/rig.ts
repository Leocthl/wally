// The real on-device client opened on a test storage, the way the page opens it; "boot" again is a reload.
import { seededRandom } from "@wally/rail-sim";
import type { FakeClock } from "@wally/core/testing";
import type { LocalApiClientOptions } from "../../src/api/local/LocalApiClient";
import { PersistentLocalApiClient, type PersistOptions } from "../../src/api/local/persist/PersistentLocalApiClient";
import { MemoryStorage } from "./memoryStorage";
import { clockAt } from "./support";

export interface Rig {
  readonly storage: MemoryStorage;
  readonly clock: FakeClock;
  readonly open: Array<PersistentLocalApiClient>;
  /** "Reload": a new client on the same storage, the way the page boots. */
  boot(extra?: Partial<LocalApiClientOptions & PersistOptions>): Promise<PersistentLocalApiClient>;
  dispose(): void;
}

export function rig(storage: MemoryStorage = new MemoryStorage(), clock: FakeClock = clockAt()): Rig {
  const open: PersistentLocalApiClient[] = [];
  return {
    storage,
    clock,
    open,
    async boot(extra = {}) {
      const client = await PersistentLocalApiClient.open({ storage, page: null, clock, railRandom: () => seededRandom(7), tickMs: null, ...extra });
      open.push(client);
      return client;
    },
    dispose() {
      for (const client of open.splice(0)) client.dispose();
    },
  };
}
