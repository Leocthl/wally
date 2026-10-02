// Provenance tags (docs/04 Provenance chips, 00-context Provenance and citation). Every figure carries one.
import { formatHkDateTime } from "./time";

export type Prov =
  | { readonly kind: "SIMULATED" }
  | { readonly kind: "OBSERVED"; readonly at: string; readonly source: string }
  | { readonly kind: "MEASURED"; readonly n: number }
  | { readonly kind: "ASSUMED"; readonly suffix?: "READ-BY-CLAUDE" | "VENDOR-REPORTED" };

export type ProvKind = Prov["kind"];

export const SIMULATED: Prov = { kind: "SIMULATED" };
export const ASSUMED: Prov = { kind: "ASSUMED" };

export function measured(n: number): Prov {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("MEASURED needs a sample count n >= 1");
  return { kind: "MEASURED", n };
}

export function observed(at: string, source: string): Prov {
  return { kind: "OBSERVED", at, source };
}

/** Chip text exactly as docs/04 specifies. */
export function chipText(prov: Prov): string {
  switch (prov.kind) {
    case "SIMULATED":
      return "SIMULATED";
    case "OBSERVED":
      return `OBSERVED(${formatHkDateTime(prov.at)} UTC+8, ${prov.source})`;
    case "MEASURED":
      return `MEASURED(n=${prov.n})`;
    case "ASSUMED":
      return prov.suffix ? `ASSUMED (${prov.suffix})` : "ASSUMED";
  }
}

/** Two provenances cover each other only when their chip text is identical. */
export function sameProv(a: Prov, b: Prov): boolean {
  return chipText(a) === chipText(b);
}

/** The cart's own tag: SIMULATED fixtures, or OBSERVED from the price capture time (docs/04: OBSERVED(<date time UTC+8>, <source>)). */
export function cartProv(cart: { readonly provenance: "OBSERVED" | "SIMULATED"; readonly price_observed_at: string }): Prov {
  return cart.provenance === "SIMULATED" ? SIMULATED : observed(cart.price_observed_at, "listing capture");
}

/** A judge probability: a recorded replay is SIMULATED; a live Laya or Jev call is one run of ours, MEASURED(n=1) (docs/04 Run). */
export function judgeProv(provider: string): Prov {
  return provider === "replay" ? SIMULATED : measured(1);
}

/** Stage latencies: the mock replays fixture numbers (SIMULATED); a live client reports its own timing, MEASURED(n=1). */
export function latencyProv(api: "mock" | "http"): Prov {
  return api === "mock" ? SIMULATED : measured(1);
}
