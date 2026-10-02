// Node side of LAN mode (the guards are in http/lan.ts): the launch switches, this machine's addresses and names, the
// pairing token and the QR codes. Everything that touches the system is injectable, so tests never read the real network.
import { hostname as osHostname, networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { getConnInfo } from "@hono/node-server/conninfo";
import { renderSVG } from "uqr";
import type { Env } from "./booth/settings";
import { isLoopbackHostname } from "./http/guards";
import { newPairingToken, type LanOptions } from "./http/lan";

/** What the server reads from the machine; swapped for fixed values in tests. */
export interface NetworkInfo {
  readonly interfaces: () => Readonly<Record<string, readonly NetworkInterfaceInfo[] | undefined>>;
  readonly hostname: () => string;
}

export const SYSTEM_NETWORK: NetworkInfo = { interfaces: () => networkInterfaces(), hostname: () => osHostname() };

export interface Launch {
  /** Address the server binds. */
  readonly host: string;
  /** LAN mode: the pairing token, the machine's addresses as allowed hosts, the phone rules. */
  readonly lan: boolean;
}

const LOOPBACK_BINDS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * `--lan` binds 0.0.0.0; HOST names another address. Any bind that is not loopback turns LAN mode on, so the network is
 * never reachable without the token. Neither switch: 127.0.0.1 and no LAN mode, exactly as before.
 */
export function launchFromEnv(env: Env, argv: readonly string[]): Launch {
  const flag = argv.includes("--lan");
  const given = env["HOST"]?.trim();
  const host = given !== undefined && given !== "" ? given : flag ? "0.0.0.0" : "127.0.0.1";
  return { host, lan: flag || !LOOPBACK_BINDS.has(host.toLowerCase()) };
}

const isIpv4 = (info: NetworkInterfaceInfo): boolean => String(info.family) === "IPv4" || String(info.family) === "4";
const isLinkLocal = (address: string): boolean => address.startsWith("169.254.");
const isPrivateRange = (address: string): boolean => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
/** Interfaces no phone on the Wi-Fi can reach: VPN and other tunnels, Apple wireless direct links, container bridges. */
const NOT_FOR_PHONES = /^(utun|tun|tap|ppp|ipsec|wg|gif|stf|awdl|llw|anpi|vmnet|veth|docker|br-)/i;

function addresses(net: NetworkInfo, keep: (name: string, address: string) => boolean): readonly string[] {
  const found = Object.entries(net.interfaces()).flatMap(([name, list]) => (list ?? []).filter((i) => !i.internal && isIpv4(i) && keep(name, i.address)).map((i) => i.address));
  const unique = [...new Set(found)];
  return [...unique.filter(isPrivateRange), ...unique.filter((a) => !isPrivateRange(a))]; // private ranges first: the Wi-Fi before a VPN
}

/** Every non-internal IPv4 address of this machine: the Host names the server answers. */
export function ipv4Addresses(net: NetworkInfo): readonly string[] {
  return addresses(net, () => true);
}

/** The addresses worth a pairing link: no tunnels, no link-local 169.254 (a Mac with no DHCP answer). */
export function phoneAddresses(net: NetworkInfo): readonly string[] {
  return addresses(net, (name, address) => !NOT_FOR_PHONES.test(name) && !isLinkLocal(address));
}

/** os.hostname() and its Bonjour form, lower case: "Leos-Mac.local" gives leos-mac and leos-mac.local. */
export function machineNames(net: NetworkInfo): { readonly base: string | null; readonly all: readonly string[] } {
  const raw = net.hostname().trim().toLowerCase();
  const base = raw.replace(/\.local$/, "");
  if (base === "") return { base: null, all: [] };
  return { base, all: [...new Set([raw, base, `${base}.local`])] };
}

/** Pairing links: one per address a phone can use, then the .local name. */
export function lanUrls(net: NetworkInfo, port: number, token: string): readonly string[] {
  const { base } = machineNames(net);
  const hosts = [...phoneAddresses(net), ...(base === null ? [] : [`${base}.local`])];
  return hosts.map((host) => `http://${host}:${port}/?t=${token}`);
}

export interface LanSetup {
  readonly port: number;
  readonly network?: NetworkInfo;
  readonly token?: string;
  readonly qr?: (text: string) => string;
  readonly remoteAddress?: LanOptions["remoteAddress"];
}

const socketAddress: LanOptions["remoteAddress"] = (c) => {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined; // an in-process request has no socket
  }
};

/** Medium error correction and a 3-module quiet zone: reads reliably off a laptop screen. */
const renderQr = (text: string): string => renderSVG(text, { ecc: "M", border: 3 });

export function createLanOptions(setup: LanSetup): LanOptions {
  const net = setup.network ?? SYSTEM_NETWORK;
  const token = setup.token ?? newPairingToken();
  return {
    token,
    // Read per request: the Wi-Fi can hand the Mac a new address in the middle of a day.
    hostAllowed: (hostname) => {
      const name = hostname.toLowerCase();
      return isLoopbackHostname(name) || ipv4Addresses(net).includes(name) || machineNames(net).all.includes(name);
    },
    urls: () => lanUrls(net, setup.port, token),
    qrSvg: setup.qr ?? renderQr,
    remoteAddress: setup.remoteAddress ?? socketAddress,
  };
}
