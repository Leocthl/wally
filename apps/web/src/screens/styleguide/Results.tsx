// Compositions: Approved and Stopped. One big plain sentence, the amount, what happens next, and a "Why?" sheet that
// holds the rule ids and inputs (never on the main surface). Footer: fixed rules decided, not the AI.
import { useState, type ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { Button } from "../../ui/Button";
import { ProvenanceChip, Tag } from "../../ui/Chip";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { TopBar } from "../../ui/Nav";
import { Sheet } from "../../ui/Overlay";
import { Card, List, ListRow } from "../../ui/Surface";
import { Wally } from "../../wally/Wally";
import { C } from "./copy";
import { Phone } from "./Phone";
import { money, SAMPLE } from "./sample";

interface WhyRow {
  readonly id: string;
  readonly rule: string;
  readonly name: string;
  readonly detail: string;
  readonly ok: boolean;
}

function WhySheet({ open, onClose, title, rows }: { readonly open: boolean; readonly onClose: () => void; readonly title: string; readonly rows: readonly WhyRow[] }): ReactElement {
  const { t } = useLocale();
  return (
    <Sheet open={open} onClose={onClose} title={title} description={t(C.rulesDecided)}>
      <List inset>
        {rows.map((r) => (
          <ListRow key={r.id} leading={<Icon name={r.ok ? "check" : "hand"} />} tone={r.ok ? "ok" : "stop"} title={<>{r.name} <span className="sg-rule-id" data-ident>{r.rule}</span></>} subtitle={r.detail} trailing={<Tag size="sm" tone={r.ok ? "ok" : "stop"}>{t(r.ok ? C.pass : C.fail)}</Tag>} />
        ))}
      </List>
    </Sheet>
  );
}

function Footnote(): ReactElement {
  const { t } = useLocale();
  return <p className="sg-foot"><Icon name="shieldCheck" size={18} /> {t(C.rulesDecided)}</p>;
}

export function Approved(): ReactElement {
  const { t } = useLocale();
  const [why, setWhy] = useState(false);
  const amount = money(SAMPLE.jacket);
  return (
    <Phone title="Approved">
      <div className="sg-body sg-body--top">
        <TopBar sticky={false} title={t(C.jacket)} subtitle={SAMPLE.shop} onBack={() => undefined} />
        <div className="sg-result" role="status">
          <Wally state="approved" size={112} decorative />
          <h3 className="sg-result__title">{t(C.madeCard)}</h3>
          <p className="sg-result__amount" data-selectable>{amount}</p>
        </div>
        <Card tone="ticket" padding="lg" className="sg-ticket">
          <Tag tone="ok" size="sm" className="w-card__corner" icon={<Icon name="check" size={14} />}>{t(C.approved)}</Tag>
          <span className="sg-ticket__label"><Icon name="card" size={18} /> {t(C.oneOffCard)}</span>
          <span className="sg-ticket__number" aria-label={t(C.cardEnding(SAMPLE.last4))} data-selectable>•••• {SAMPLE.last4}</span>
          <span className="sg-ticket__once">{t(C.worksOnce(amount))}</span>
          <span className="sg-ticket__meta">{t(C.lockedTo(SAMPLE.shop))} <ProvenanceChip prov={SIMULATED} /></span>
        </Card>
        <div className="sg-actions">
          <Button size="lg" block icon={<Icon name="lock" size={20} />}>{t(C.payNow)}</Button>
          <Button variant="ghost" block onClick={() => setWhy(true)}>{t(C.whyApproved)}</Button>
        </div>
        <Footnote />
      </div>
      <WhySheet
        open={why}
        onClose={() => setWhy(false)}
        title={t(C.whyApprovedTitle)}
        rows={[
          { id: "r3", rule: "R3", name: t(C.ruleBudget), detail: `${amount} ≤ ${money(SAMPLE.left)}`, ok: true },
          { id: "r9", rule: "R9", name: t(C.ruleSeller), detail: t(C.verifiedSeller), ok: true },
          { id: "r10", rule: "R10", name: t(C.ruleListing), detail: t(C.stepReadDetail), ok: true },
        ]}
      />
    </Phone>
  );
}

export function Stopped(): ReactElement {
  const { t } = useLocale();
  const [why, setWhy] = useState(false);
  const total = money(SAMPLE.shoes);
  const left = money(SAMPLE.left);
  return (
    <Phone title="Stopped">
      <div className="sg-body sg-body--top">
        <TopBar sticky={false} title={t(C.sneakers)} subtitle={SAMPLE.shop} onBack={() => undefined} />
        <div className="sg-result" role="alert">
          <Wally state="stopped" size={112} decorative />
          <h3 className="sg-result__title">{t(C.stoppedShort)}</h3>
          <p className="sg-result__sentence">{t(C.overBy(total, left, money(SAMPLE.shipping)))}</p>
          <Tag tone="stop" icon={<Icon name="hand" size={16} />}>{t(C.budgetRule)}</Tag>
        </div>
        <Card dashed className="sg-nocard">
          <Icon name="card" size={22} />
          <span><strong>{t(C.noCard)}</strong><br /><span className="sg-muted">{t(C.noCardBody)}</span></span>
        </Card>
        <div className="sg-actions">
          <Button size="lg" block>{t(C.cheaper)}</Button>
          <Button size="lg" variant="secondary" block>{t(C.topUp)}</Button>
          <Button variant="ghost" block onClick={() => setWhy(true)} icon={<Icon name="info" size={20} />}>{t(C.why)}</Button>
        </div>
        <Footnote />
      </div>
      <WhySheet open={why} onClose={() => setWhy(false)} title={t(C.whyTitle)} rows={[{ id: "r3", rule: "R3", name: t(C.ruleBudget), detail: `${total} > ${left}`, ok: false }, { id: "r9", rule: "R9", name: t(C.ruleSeller), detail: t(C.verifiedSeller), ok: true }]} />
    </Phone>
  );
}
