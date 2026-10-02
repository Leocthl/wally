// Escalation (amber): countdown to R11, announced at the start and the end only (docs/04 Live regions).
import { useEffect, useState, type ReactElement } from "react";
import type { EscalationView } from "../api/types";
import type { Prov } from "../domain/provenance";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { Num } from "./Num";
import { StateBadge } from "./StateBadge";

const TICK_MS = 1000;

export interface EscalationPanelProps {
  readonly escalation: EscalationView;
  readonly prov: Prov;
  readonly configProv: Prov;
  readonly now: () => number;
  readonly onAnswer: (choice: "APPROVE" | "DENY") => void;
  readonly disabled?: boolean;
}

export function EscalationPanel({ escalation, prov, configProv, now, onAnswer, disabled = false }: EscalationPanelProps): ReactElement {
  const [clock, setClock] = useState(now());
  const open = escalation.state === "OPEN";
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setClock(now()), TICK_MS);
    return () => clearInterval(id);
  }, [open, now]);
  const left = Math.max(0, Math.ceil((Date.parse(escalation.expiresAt) - clock) / TICK_MS));
  return (
    <section className="card escalation" data-register="ledger" data-state={escalation.state} aria-label="Escalation">
      <header>
        <h3><Bi text={S.escalationTitle} /></h3>
        <StateBadge tone="escalated" text="ESCALATED" ruleId={escalation.ruleId} zh="待確認" />
      </header>
      <p className="soft">
        {escalation.merchantName} <Num kind="money" value={escalation.totalMinor} prov={prov} />
      </p>
      {open ? (
        <>
          <p role="status"><Bi text={S.escalationOpen} /></p>
          <p className="escalation__count" role="timer" aria-live="off">
            <Num kind="seconds" value={left} prov={configProv} />
          </p>
          <div className="escalation__buttons">
            <button type="button" className="btn btn--primary tap" onClick={() => onAnswer("APPROVE")} disabled={disabled}><Bi text={S.approve} /></button>
            <button type="button" className="btn tap" onClick={() => onAnswer("DENY")} disabled={disabled}><Bi text={S.deny} /></button>
          </div>
        </>
      ) : (
        <p role="status">
          {escalation.state === "EXPIRED" ? <Bi text={S.escalationExpired} /> : <StateBadge tone={escalation.state === "APPROVED" ? "minted" : "stopped"} text={escalation.state} />}
        </p>
      )}
    </section>
  );
}
