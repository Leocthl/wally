// Packet console (docs/04 Screens, PACKET): PacketMeter, CardTickets, the open escalation, RevokeButton.
import { useCallback, type ReactElement } from "react";
import { Bi } from "../components/Bi";
import { CardTicket } from "../components/CardTicket";
import { EscalationPanel } from "../components/EscalationPanel";
import { PacketMeter } from "../components/PacketMeter";
import { RevokeButton } from "../components/RevokeButton";
import { StateBadge } from "../components/StateBadge";
import { ASSUMED, SIMULATED } from "../domain/provenance";
import { useBoothContext } from "../hooks/useBooth";
import { S } from "../i18n/strings";

export function PacketPanel({ meter = true }: { readonly meter?: boolean }): ReactElement {
  const { state, busy, revoke, answer } = useBoothContext();
  const now = useCallback(() => Date.now(), []);
  const { packet, cards, escalations, revoked, mandate } = state;
  return (
    <section className="console" data-register="packet" aria-label="Packet console">
      {packet && meter ? <PacketMeter packet={packet} prov={SIMULATED} /> : null}
      {escalations.map((e) => (
        <EscalationPanel key={e.decisionId} escalation={e} prov={SIMULATED} configProv={ASSUMED} now={now} disabled={busy} onAnswer={(choice) => void answer(e.decisionId, choice)} />
      ))}
      <h3><Bi text={S.cardsTitle} /></h3>
      {cards.length === 0 ? <Bi as="p" text={S.noCards} className="soft" /> : cards.map((c) => <CardTicket key={c.id} card={c} />)}
      <h3><Bi text={S.revokeTitle} /></h3>
      {revoked ? (
        <p role="status"><StateBadge tone="stopped" text="REVOKED" zh="已撤銷" /> <Bi text={S.revokeDone} /></p>
      ) : (
        <RevokeButton key={mandate?.id ?? "none"} onRevoke={() => void revoke()} disabled={busy || !mandate} />
      )}
    </section>
  );
}
