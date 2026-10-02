// The rail is SIMULATED and says so on every screen (CLAUDE.md, docs/04 Microcopy "Rail badge").
import type { ReactElement } from "react";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";
import { ProvChip } from "./ProvChip";
import { SIMULATED } from "../domain/provenance";

export function RailBadge(): ReactElement {
  return (
    <div className="rail-badge" role="note" data-register="ledger">
      <ProvChip prov={SIMULATED} />
      <Bi text={S.railBadge} className="rail-badge__text" />
    </div>
  );
}

export function Footer({ replayed }: { readonly replayed: boolean }): ReactElement {
  return (
    <footer className="site-footer" data-register="ledger">
      {replayed ? <Bi as="p" text={S.replayed} className="site-footer__replayed" /> : null}
      <Bi as="p" text={S.footer} />
    </footer>
  );
}
