// @vitest-environment node
// The Node side of LAN mode with a fixed network: launch switches, which addresses count, the names, the pairing links
// and the QR codes. No test reads the machine's real interfaces.
import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { createLanOptions, ipv4Addresses, lanUrls, launchFromEnv, machineNames, type NetworkInfo } from "../../server/lanMode";

const iface = (address: string, family: string | number, internal = false): NetworkInterfaceInfo =>
  ({ address, netmask: "255.255.255.0", family, mac: "00:00:00:00:00:00", internal, cidr: `${address}/24` }) as unknown as NetworkInterfaceInfo;

const net = (lists: Record<string, NetworkInterfaceInfo[] | undefined>, hostname = "Leos-Mac.local"): NetworkInfo => ({ interfaces: () => lists, hostname: () => hostname });

describe("launchFromEnv", () => {
  it.each([
    [{}, [], "127.0.0.1", false],
    [{ HOST: "" }, [], "127.0.0.1", false],
    [{ HOST: "127.0.0.1" }, [], "127.0.0.1", false],
    [{ HOST: "localhost" }, [], "localhost", false],
    [{ HOST: "::1" }, [], "::1", false],
    [{}, ["--lan"], "0.0.0.0", true],
    [{ HOST: "127.0.0.1" }, ["--lan"], "127.0.0.1", true],
    [{ HOST: "0.0.0.0" }, [], "0.0.0.0", true],
    [{ HOST: "192.168.1.23" }, [], "192.168.1.23", true],
    [{ HOST: " :: " }, [], "::", true],
  ] as const)("env %j argv %j binds %s, LAN mode %s", (env, argv, host, lan) => {
    expect(launchFromEnv(env, argv)).toEqual({ host, lan });
  });
});

describe("ipv4Addresses", () => {
  it("keeps non-internal IPv4 only, private ranges first, no duplicates", () => {
    const found = ipv4Addresses(
      net({
        lo0: [iface("127.0.0.1", "IPv4", true), iface("::1", "IPv6", true)],
        utun3: [iface("100.64.1.2", "IPv4")],
        en0: [iface("192.168.1.23", "IPv4"), iface("fe80::1", "IPv6"), iface("192.168.1.23", "IPv4")],
        bridge100: [iface("172.20.10.1", "IPv4"), iface("172.32.0.1", "IPv4")],
        en1: [iface("10.0.0.7", 4)],
        gone: undefined,
      }),
    );
    expect(found).toEqual(["192.168.1.23", "172.20.10.1", "10.0.0.7", "100.64.1.2", "172.32.0.1"]);
  });

  it("is empty with no network", () => {
    expect(ipv4Addresses(net({ lo0: [iface("127.0.0.1", "IPv4", true)] }))).toEqual([]);
  });
});

describe("machineNames", () => {
  it.each([
    ["Leos-Mac.local", "leos-mac", ["leos-mac.local", "leos-mac"]],
    ["Leos-Mac", "leos-mac", ["leos-mac", "leos-mac.local"]],
    ["booth.lan", "booth.lan", ["booth.lan", "booth.lan.local"]],
    ["  ", null, []],
  ] as const)("%s", (hostname, base, all) => {
    const names = machineNames(net({}, hostname));
    expect(names.base).toBe(base);
    expect([...names.all].sort()).toEqual([...all].sort());
  });
});

describe("lanUrls", () => {
  const lists = { en0: [iface("192.168.1.23", "IPv4")], en5: [iface("169.254.3.3", "IPv4")] };

  it("lists the addresses others can use, then the .local name once", () => {
    expect(lanUrls(net(lists), 8791, "abc")).toEqual(["http://192.168.1.23:8791/?t=abc", "http://leos-mac.local:8791/?t=abc"]);
  });

  it("still offers the .local name with no address, and nothing without a name", () => {
    expect(lanUrls(net({}), 8787, "t")).toEqual(["http://leos-mac.local:8787/?t=t"]);
    expect(lanUrls(net({}, ""), 8787, "t")).toEqual([]);
  });
});

describe("createLanOptions", () => {
  const lan = createLanOptions({ port: 8787, network: net({ en0: [iface("192.168.1.23", "IPv4")] }), token: "tok" });

  it("allows loopback, the addresses and the names of the machine, any case, and nothing else", () => {
    for (const ok of ["127.0.0.1", "localhost", "[::1]", "192.168.1.23", "leos-mac", "leos-mac.local", "LEOS-MAC.LOCAL"]) expect(lan.hostAllowed(ok), ok).toBe(true);
    for (const no of ["192.168.1.24", "evil.example", "leos-mac.evil.example", "0.0.0.0", ""]) expect(lan.hostAllowed(no), no).toBe(false);
  });

  it("makes a new token per setup and draws a QR code that is SVG", () => {
    const a = createLanOptions({ port: 1 }).token;
    const b = createLanOptions({ port: 1 }).token;
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    const svg = lan.qrSvg(lan.urls()[0] ?? "");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox");
    expect(svg).toContain('fill="white"'); // a light background in dark mode too
  });

  it("has no peer address when there is no socket", () => {
    expect(lan.remoteAddress({ env: undefined } as never)).toBeUndefined();
    expect(lan.remoteAddress({ env: { incoming: { socket: { remoteAddress: "10.0.0.2" } } } } as never)).toBe("10.0.0.2");
  });
});
