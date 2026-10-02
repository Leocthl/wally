// Recent purchases as card rows: what, how it ended, the amount; each opens that result on this screen.
import { useId, type ReactElement } from "react";
import { formatHkd } from "../../../domain/money";
import { SIMULATED } from "../../../domain/provenance";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { ProvenanceChip, Tag, type TagTone } from "../../../ui/Chip";
import { Icon, type IconName } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { List, ListRow } from "../../../ui/Surface";
import { itemTitle } from "../model/item";
import type { HistoryRow } from "../model/screen";
import { wallyHref } from "../useDecisionParam";

const R = UI.run;

function look(row: HistoryRow): { readonly icon: IconName; readonly tone: "ok" | "stop" | "warn"; readonly tag: TagTone; readonly text: LabelPair } {
  if (row.kind === "approved") return { icon: "checkCircle", tone: "ok", tag: "ok", text: row.paid ? R.statusPaid : R.statusApproved };
  if (row.kind === "needsOk") return { icon: "clock", tone: "warn", tag: "warn", text: R.statusNeedsOk };
  return { icon: "hand", tone: "stop", tag: "stop", text: R.statusStopped };
}

export function History({ rows, title }: { readonly rows: readonly HistoryRow[]; readonly title: LabelPair }): ReactElement | null {
  const { t } = useLocale();
  const id = useId();
  if (rows.length === 0) return null;
  return (
    <section className="run-history" aria-labelledby={id}>
      <div className="run-history__head">
        <h3 id={id} className="run-section-title">{t(title)}</h3>
        <ProvenanceChip prov={SIMULATED} />
      </div>
      <List cards label={t(title)}>
        {rows.map((row) => {
          const l = look(row);
          return (
            <ListRow
              key={row.chain.root.id}
              href={wallyHref(row.chain.root.id)}
              leading={<Icon name={l.icon} />}
              tone={l.tone}
              title={itemTitle(row.chain.current.cart)}
              subtitle={<Tag tone={l.tag} size="sm">{t(l.text)}</Tag>}
              trailing={formatHkd(row.chain.current.cart.total_minor)}
              chevron
            />
          );
        })}
      </List>
    </section>
  );
}
