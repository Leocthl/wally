// When the demo scenarios are open on Home: closed by default for a shopper, open on the booth Mac, with ?booth=1 and in presenter
// mode, and the person's own choice is remembered per browser (and never breaks when storage is refused).
import { describe, expect, it } from "vitest";
import {
  boothFlag,
  DEMO_OPEN_KEY,
  demoDefaultOpen,
  isLoopbackHost,
  readStoredChoice,
  rememberChoice,
  type DemoEnv,
} from "../src/screens/home/demoMode";

const phone: DemoEnv = { hostname: "192.168.1.20", search: "", hash: "#/budget", native: false, presenter: false, stored: null };

describe("isLoopbackHost", () => {
  it.each(["localhost", "LOCALHOST", "127.0.0.1", "127.1.2.3", "::1", "[::1]", "wally.localhost"])("%s is the machine itself", (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(["", "wally.example", "192.168.1.20", "10.0.0.2", "172.16.0.5", "mac.local", "localhost.evil.example", "127.0.0.1.evil.example", "128.0.0.1"])("%s is not", (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe("boothFlag", () => {
  it.each(["?booth=1", "?x=2&booth=1", "?booth=1&x=2"])("%s in the address turns booth mode on", (search) => {
    expect(boothFlag(search, "#/budget")).toBe(true);
  });

  it.each(["#/budget?booth=1", "#/budget?focus=console&booth=1", "#/?booth=1"])("%s in the hash does too", (hash) => {
    expect(boothFlag("", hash)).toBe(true);
  });

  it.each([["?booth=0", ""], ["?booth=", ""], ["?booth=true", ""], ["?notbooth=1", ""], ["", "#/booth"], ["", "#/budget"], ["", ""]])("%j %j does not", (search, hash) => {
    expect(boothFlag(search, hash)).toBe(false);
  });
});

describe("demoDefaultOpen", () => {
  it("is closed for a shopper on a phone or the live link", () => {
    expect(demoDefaultOpen(phone)).toBe(false);
    expect(demoDefaultOpen({ ...phone, hostname: "wally.example" })).toBe(false);
  });

  it("is open on the booth Mac (a loopback address) and with ?booth=1 and in presenter mode", () => {
    expect(demoDefaultOpen({ ...phone, hostname: "127.0.0.1" })).toBe(true);
    expect(demoDefaultOpen({ ...phone, search: "?booth=1" })).toBe(true);
    expect(demoDefaultOpen({ ...phone, presenter: true })).toBe(true);
  });

  it("is closed inside the native app, whose own address is localhost", () => {
    expect(demoDefaultOpen({ ...phone, hostname: "localhost", native: true })).toBe(false);
  });

  it("follows the person's own choice over the host", () => {
    expect(demoDefaultOpen({ ...phone, stored: true })).toBe(true);
    expect(demoDefaultOpen({ ...phone, hostname: "127.0.0.1", stored: false })).toBe(false);
  });

  it("opens for ?booth=1 and presenter mode whatever was chosen before (the stage must not need a tap)", () => {
    expect(demoDefaultOpen({ ...phone, search: "?booth=1", stored: false })).toBe(true);
    expect(demoDefaultOpen({ ...phone, presenter: true, stored: false })).toBe(true);
  });
});

class Memory {
  readonly data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

describe("the remembered choice", () => {
  it("is 1 for open, 0 for closed, and nothing for anything else", () => {
    const s = new Memory();
    expect(readStoredChoice(s)).toBeNull();
    rememberChoice(true, s);
    expect(s.data.get(DEMO_OPEN_KEY)).toBe("1");
    expect(readStoredChoice(s)).toBe(true);
    rememberChoice(false, s);
    expect(s.data.get(DEMO_OPEN_KEY)).toBe("0");
    expect(readStoredChoice(s)).toBe(false);
    s.setItem(DEMO_OPEN_KEY, "maybe");
    expect(readStoredChoice(s)).toBeNull();
  });

  it("never throws when storage refuses, or is missing", () => {
    const refusing = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    };
    expect(readStoredChoice(refusing)).toBeNull();
    expect(() => rememberChoice(true, refusing)).not.toThrow();
    expect(readStoredChoice(null)).toBeNull();
    expect(() => rememberChoice(true, null)).not.toThrow();
  });
});
