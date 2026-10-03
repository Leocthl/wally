// Phones for the session tests: the composed booth on the real stack in LAN mode, and clients that hold cookies like a
// browser. The booth sees each request's peer through a test header (the real server reads the socket), so one test
// process can be the booth Mac (peer 127.0.0.1) and any number of phones (other peers) at once. No port is opened.
import type { NetworkInterfaceInfo } from "node:os";
import type { Hono } from "hono";
import { FakeClock, MemoryLogStore } from "@wally/core/testing";
import { seededRandom } from "@wally/rail-sim";
import { ephemeralKeys } from "../../../server/booth/keys";
import { composeBooth, type Booth, type ComposeOptions } from "../../../server/compose";
import { createLanOptions, type NetworkInfo } from "../../../server/lanMode";
import type { LanOptions } from "../../../server/http/lan";
import type { ExportView, PublicKeysView } from "../../../server/backend";
import type { BoothSnapshot, LogView, RunSummary, VerifyOutcome } from "../../../src/api/types";
import { verifyChain } from "@wally/core/verify";

export const TOKEN = "0123456789abcdef0123456789abcdef";
export const PORT = 8817;
export const MAC_LAN_HOST = `192.168.0.6:${PORT}`;
export const MAC_LOOPBACK_HOST = `127.0.0.1:${PORT}`;

const iface = (address: string): NetworkInterfaceInfo =>
  ({ address, netmask: "255.255.255.0", family: "IPv4", mac: "00:00:00:00:00:00", internal: false, cidr: `${address}/24` }) as NetworkInterfaceInfo;

export const NETWORK: NetworkInfo = { interfaces: () => ({ en0: [iface("192.168.0.6")] }), hostname: () => "Booth-Mac.local" };

/** LAN options whose socket peer is whatever the test puts in the x-test-peer header. */
export function testLan(extra: Partial<LanOptions> = {}): LanOptions {
  return { ...createLanOptions({ port: PORT, network: NETWORK, token: TOKEN }), remoteAddress: (c) => c.req.header("x-test-peer"), ...extra };
}

export interface BootOptions extends Partial<ComposeOptions> {
  /** Environment on top of the replay judge and planner (deterministic, offline). */
  readonly env?: Readonly<Record<string, string>>;
}

/** A started booth in LAN mode (sessions on by default, as in `pnpm demo:lan`). */
export async function bootLan({ env, ...over }: BootOptions = {}): Promise<Booth> {
  const booth = composeBooth({
    env: { JUDGE_PROVIDER: "replay", PLANNER_PROVIDER: "replay", ...env },
    store: new MemoryLogStore(),
    railRandom: () => seededRandom(7),
    keys: ephemeralKeys,
    clock: new FakeClock(),
    tickMs: null,
    warmUp: false,
    lan: testLan(),
    extraRoutes: (app) => app.get("*", (c) => c.html("<!doctype html><title>shell</title>")),
    ...over,
  });
  await booth.start();
  return booth;
}

export interface PhoneOptions {
  readonly peer?: string;
  readonly host?: string;
  /** false: no pairing token header (a stranger). */
  readonly token?: boolean;
  /** false: the client does not keep cookies (a native shell or a script). */
  readonly cookies?: boolean;
  /** Sent on every request (an Origin, an X-Wally-Session). */
  readonly headers?: Readonly<Record<string, string>>;
}

/** One client of the booth: a cookie jar and the pairing token, calling the Hono app in process. */
export class Phone {
  readonly #app: Hono;
  readonly #opts: PhoneOptions;
  #jar: ReadonlyMap<string, string> = new Map();

  constructor(app: Hono, opts: PhoneOptions = {}) {
    this.#app = app;
    this.#opts = opts;
  }

  /** The cookie jar as a Cookie header. */
  get cookie(): string {
    return [...this.#jar].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  /** The wally_s cookie value, if the booth set one. */
  get sessionId(): string | undefined {
    return this.#jar.get("wally_s");
  }

  /** Forgets every cookie, as a browser in a fresh private window. */
  forget(): void {
    this.#jar = new Map();
  }

  /** Puts a cookie in the jar by hand (a stale or foreign id). */
  hold(name: string, value: string): void {
    this.#jar = new Map(this.#jar).set(name, value);
  }

  async call(path: string, init: RequestInit = {}, more: Readonly<Record<string, string>> = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const set = (name: string, value: string): void => {
      if (!headers.has(name)) headers.set(name, value);
    };
    set("x-test-peer", this.#opts.peer ?? "192.168.0.50");
    if (this.#opts.token !== false) set("x-wally-token", TOKEN);
    if (this.#opts.cookies !== false && this.cookie !== "") set("cookie", this.cookie);
    for (const [name, value] of Object.entries({ ...this.#opts.headers, ...more })) set(name, value);
    const res = await this.#app.request(`http://${this.#opts.host ?? MAC_LAN_HOST}${path}`, { ...init, headers });
    if (this.#opts.cookies !== false) this.#keep(res);
    return res;
  }

  #keep(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const at = pair.indexOf("=");
      if (at > 0) this.#jar = new Map(this.#jar).set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  }

  get(path: string, more: Readonly<Record<string, string>> = {}): Promise<Response> {
    return this.call(path, { method: "GET" }, more);
  }

  post(path: string, body: unknown = {}, more: Readonly<Record<string, string>> = {}): Promise<Response> {
    return this.call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, more);
  }

  async json<T>(res: Promise<Response>, status = 200): Promise<T> {
    const done = await res;
    if (done.status !== status) throw new Error(`expected ${status}, got ${done.status}: ${await done.text()}`);
    return (await done.json()) as T;
  }

  info = (): Promise<{ readonly sessions?: string; readonly keys?: string } & Record<string, unknown>> => this.json(this.get("/api/info"));
  snapshot = (): Promise<BoothSnapshot> => this.json(this.get("/api/snapshot"));
  log = (): Promise<LogView> => this.json(this.get("/api/log"));
  run = (id: string): Promise<RunSummary> => this.json(this.post(`/api/scenario/${id}`));
  verify = (): Promise<VerifyOutcome> => this.json(this.post("/api/verify"));
  exported = (): Promise<ExportView> => this.json(this.get("/api/export"));
}

/** Does the offline verifier accept this export, checked against these public keys? */
export function chainVerifies(log: string, keys: Pick<PublicKeysView, "engine" | "delegator">, checkpoint: ExportView["checkpoint"]): boolean {
  const entries = log.trim().split("\n").map((line) => JSON.parse(line) as unknown);
  return verifyChain(entries, { engine: keys.engine, delegator: keys.delegator }, checkpoint ?? undefined).ok;
}

export const phonesOf = (booth: Booth, count: number, opts: PhoneOptions = {}): Phone[] =>
  Array.from({ length: count }, (_, i) => new Phone(booth.app, { peer: `192.168.0.${50 + i}`, ...opts }));

/** The Mac itself: loopback Host and peer, no token, no cookies. */
export const macOf = (booth: Booth): Phone => new Phone(booth.app, { peer: "127.0.0.1", host: MAC_LOOPBACK_HOST, token: false, cookies: false });
