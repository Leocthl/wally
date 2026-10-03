// Mock clients that fail on purpose, for the shell's first-run, retry and error paths (lane b-shell tests).
import { FakeClock } from "@wally/core/testing";
import { MockApiClient } from "../../src/api/MockApiClient";
import type { ApiInfo, SealRequest, SealResult } from "../../src/api/types";

const instant = { sleep: async () => undefined, pace: 0 } as const;

/** The preset seal on load fails once (nothing sealed), so the shell must send the visitor to Seal. */
export class FirstSealFails extends MockApiClient {
  sealCalls = 0;

  constructor() {
    super({ clock: new FakeClock(), ...instant });
  }

  override seal(req: SealRequest): Promise<SealResult> {
    this.sealCalls += 1;
    if (this.sealCalls === 1) return Promise.reject(new Error("seal refused by the test"));
    return super.seal(req);
  }
}

/** The first info() fails (the booth laptop is not answering yet); the next one works. */
export class FirstLoadFails extends MockApiClient {
  infoCalls = 0;

  constructor() {
    super({ clock: new FakeClock(), ...instant });
  }

  override info(): Promise<ApiInfo> {
    this.infoCalls += 1;
    if (this.infoCalls === 1) return Promise.reject(new Error("connection refused"));
    return super.info();
  }
}

/** Every seal fails: the Seal screen must stay put and say so. */
export class SealAlwaysFails extends MockApiClient {
  constructor() {
    super({ clock: new FakeClock(), ...instant });
  }

  override seal(): Promise<SealResult> {
    return Promise.reject(new Error("seal refused by the test"));
  }
}
