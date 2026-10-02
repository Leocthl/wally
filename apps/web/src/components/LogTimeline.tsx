// LogTimeline (docs/04, LEDGER): mono rows with seq, kind, outcome, rule ids and a hash prefix. Times share one
// provenance, so the chip sits in the column header.
import type { ReactElement } from "react";
import type { LogEntry } from "../api/types";
import type { Prov } from "../domain/provenance";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { ChipScope } from "./ChipScope";
import { Num } from "./Num";

/** Characters of the entry hash shown (docs/04: "hash prefix"). */
const HASH_PREFIX_CHARS = 8;

function detail(entry: LogEntry): { readonly outcome: string; readonly rules: string } {
  switch (entry.kind) {
    case "MANDATE_SEALED":
      return { outcome: "SEALED", rules: "R1" };
    case "DECISION": {
      const failed = entry.payload.rules.filter((r) => r.result === "FAIL").map((r) => r.id);
      return { outcome: entry.payload.outcome, rules: [...new Set(failed)].join(" ") || "all pass" };
    }
    case "CARD_MINTED":
      return { outcome: "MINTED", rules: "" };
    case "CARD_EVENT":
      return { outcome: entry.payload.decline_code ? `${entry.payload.event} ${entry.payload.decline_code}` : entry.payload.event, rules: "" };
    case "MANDATE_REVOKED":
      return { outcome: "REVOKED", rules: "R2" };
    case "PACKET_EXPIRED":
      return { outcome: "EXPIRED", rules: "R2" };
  }
}

export interface LogTimelineProps {
  readonly entries: readonly LogEntry[];
  readonly prov: Prov;
  /** The entry that differs in the tampered copy, if any. */
  readonly changedSeq?: number;
  /** The entry the verifier named as the first failure, if any. */
  readonly failedSeq?: number;
}

export function LogTimeline({ entries, prov, changedSeq, failedSeq }: LogTimelineProps): ReactElement {
  return (
    <section className="log" data-register="ledger" aria-label="Decision log">
      <ChipScope provs={[prov]}>
        <h3><Bi text={S.logTitle} /></h3>
        {entries.length === 0 ? (
          <Bi as="p" text={S.logEmpty} className="soft" />
        ) : (
          <div className="log__scroll" tabIndex={0} role="region" aria-label="Log rows, scrollable">
            <table className="log__table">
              <thead>
                <tr><th scope="col">seq</th><th scope="col">kind, outcome</th><th scope="col">rules</th><th scope="col">time, hash</th></tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const d = detail(e);
                  const flagged = e.seq === failedSeq ? "log__row--failed" : e.seq === changedSeq ? "log__row--changed" : "";
                  return (
                    <tr key={e.seq} className={`log__row ${flagged}`.trim()} {...(e.seq === failedSeq ? { "aria-current": "true" as const } : {})}>
                      <td data-ident>{e.seq}</td>
                      <td>
                        <div data-ident>{e.kind}</div>
                        <div data-ident>{d.outcome}{e.seq === changedSeq ? " CHANGED" : ""}</div>
                      </td>
                      <td data-ident>{d.rules}</td>
                      <td>
                        <div><Num kind="time" value={e.ts} prov={prov} chip="scope" /></div>
                        <div className="mono" data-ident>{e.entry_hash.slice(0, HASH_PREFIX_CHARS)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChipScope>
    </section>
  );
}
