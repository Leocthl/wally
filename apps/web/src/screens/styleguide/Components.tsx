// Style guide: every primitive in its states. Text follows the EN | 繁 toggle; the figures are SIMULATED samples.
import { useState, type ReactElement, type ReactNode } from "react";
import { ASSUMED, measured, observed, SIMULATED } from "../../domain/provenance";
import { UI } from "../../i18n/ui";
import { Button, IconButton } from "../../ui/Button";
import { ProvenanceChip, Tag } from "../../ui/Chip";
import { ProgressBar, Ring, Stat } from "../../ui/Data";
import { EmptyState } from "../../ui/EmptyState";
import { Switch, TextArea, TextField } from "../../ui/Form";
import { haptic } from "../../ui/haptics";
import { Icon, ICON_NAMES } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { Segmented, Tabs } from "../../ui/Nav";
import { Dialog, Sheet } from "../../ui/Overlay";
import { Card, Divider, List, ListRow, Skeleton } from "../../ui/Surface";
import { useToast } from "../../ui/Toast";
import { C } from "./copy";
import { money, SAMPLE } from "./sample";

function Demo({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="sg-demo">
      <h3 className="sg-demo__title">{title}</h3>
      <div className="sg-demo__body">{children}</div>
    </div>
  );
}

function Buttons(): ReactElement {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  return (
    <Demo title="Button, IconButton">
      <div className="sg-row">
        <Button>{t(C.payNow)}</Button>
        <Button variant="secondary">{t(C.topUp)}</Button>
        <Button variant="ghost">{t(C.why)}</Button>
        <Button variant="danger" icon={<Icon name="alert" size={20} />}>{t(C.tamper)}</Button>
      </div>
      <div className="sg-row">
        <Button size="sm" variant="secondary">{t(C.seeAll)}</Button>
        <Button loading={loading} onClick={() => { setLoading(true); haptic("tap"); setTimeout(() => setLoading(false), 1600); }}>{t(C.cheaper)}</Button>
        <Button disabled>{t(C.payNow)}</Button>
      </div>
      <Button size="lg" block icon={<Icon name="lock" size={20} />}>{t(C.payNow)}</Button>
      <div className="sg-row">
        <IconButton label={t(UI.close)} icon={<Icon name="close" />} />
        <IconButton label={t(C.voice)} variant="secondary" icon={<Icon name="mic" />} />
        <IconButton label={t(C.send)} variant="primary" icon={<Icon name="arrowUp" />} />
        <IconButton label={t(C.settings)} size="md" variant="secondary" icon={<Icon name="settings" />} />
      </div>
    </Demo>
  );
}

function Chips(): ReactElement {
  const { t } = useLocale();
  return (
    <Demo title="Tag, ProvenanceChip">
      <div className="sg-row">
        <Tag tone="ok" icon={<Icon name="check" size={14} />}>{t(C.approved)}</Tag>
        <Tag tone="stop" icon={<Icon name="hand" size={14} />}>{t(C.stoppedShort)}</Tag>
        <Tag tone="warn" icon={<Icon name="clock" size={14} />}>{t(C.needsOk)}</Tag>
        <Tag tone="primary" icon={<Icon name="card" size={14} />}>{t(C.oneOffCard)}</Tag>
        <Tag>{t(C.ruleClothes)}</Tag>
        <Tag tone="accent">{t(C.ruleVerified)}</Tag>
      </div>
      <div className="sg-row">
        <ProvenanceChip prov={SIMULATED} />
        <ProvenanceChip prov={measured(150)} />
        <ProvenanceChip prov={ASSUMED} />
        <ProvenanceChip prov={observed("2026-10-03T02:05:00Z", "capture sheet")} />
      </div>
    </Demo>
  );
}

function Figures(): ReactElement {
  const { t } = useLocale();
  const left = money(SAMPLE.left);
  return (
    <Demo title="Stat, ProgressBar, Ring">
      <Stat label={t(C.budgetLeft)} value={left} sub={t(C.ofBudget(money(SAMPLE.budget), "31 Oct"))} chip={<ProvenanceChip prov={SIMULATED} />} />
      <ProgressBar role="meter" value={SAMPLE.left} max={SAMPLE.budget} label={t(C.budgetLeft)} valueText={left} />
      <div className="sg-row">
        <Ring value={SAMPLE.left} max={SAMPLE.budget} label={t(C.budgetLeft)} valueText={left}><span className="sg-ring-text">{left}</span></Ring>
        <Ring tone="ok" size={64} thickness={6} value={14} max={14} label={t(C.proof)} valueText="14 / 14"><Icon name="check" /></Ring>
        <ProgressBar size="sm" tone="ok" value={3} max={4} label={t(C.stepsLabel)} valueText="3 / 4" />
      </div>
    </Demo>
  );
}

function Controls(): ReactElement {
  const { t } = useLocale();
  const [seg, setSeg] = useState<"week" | "month">("week");
  const [on, setOn] = useState(true);
  const [tab, setTab] = useState("receipts");
  return (
    <Demo title="Segmented, Switch, Tabs">
      <Segmented label="Period" value={seg} onChange={setSeg} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
      <Switch checked={on} onChange={setOn} label={t(C.needsOk)} description={t(C.stepRulesDetail)} />
      <Tabs label={t(C.proof)} value={tab} onChange={setTab} items={[
        { id: "receipts", label: t(UI.tabReceipts), panel: <p className="sg-muted">{t(C.verifiedHere)}</p> },
        { id: "rules", label: t(C.ruleSigned), panel: <p className="sg-muted">{t(C.stepRulesDetail)}</p> },
      ]} />
    </Demo>
  );
}

function Fields(): ReactElement {
  const { t } = useLocale();
  return (
    <Demo title="TextField, TextArea">
      <TextField label={t(C.ruleBudget)} inputMode="numeric" defaultValue="800" leading={<span>HK$</span>} hint={t(C.stepRulesDetail)} />
      <TextField label={t(C.ruleCategory)} defaultValue="Shoes" error={t(C.fail)} />
      <TextField variant="pill" label={t(C.askLabel)} hideLabel placeholder={t(C.askPlaceholder)} trailing={<><IconButton label={t(C.voice)} icon={<Icon name="mic" />} /><IconButton label={t(C.send)} variant="primary" icon={<Icon name="arrowUp" />} /></>} />
      <TextArea label={t(C.ruleListing)} placeholder={t(C.stepReadDetail)} />
    </Demo>
  );
}

function Overlays(): ReactElement {
  const { t } = useLocale();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  return (
    <Demo title="Sheet, Dialog, Toast">
      <div className="sg-row">
        <Button variant="secondary" onClick={() => setSheet(true)}>{t(C.why)}</Button>
        <Button variant="secondary" onClick={() => setDialog(true)}>{t(C.topUp)}</Button>
        <Button variant="secondary" onClick={() => toast.show({ message: t(UI.updateReady), tone: "info", action: { label: t(UI.updateReload), onAction: () => undefined } })}>Toast</Button>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t(C.whyTitle)} description={t(C.rulesDecided)} footer={<Button block onClick={() => setSheet(false)}>{t(UI.dismiss)}</Button>}>
        <p>{t(C.overBy(money(SAMPLE.shoes), money(SAMPLE.left), money(SAMPLE.shipping)))}</p>
      </Sheet>
      <Dialog open={dialog} onClose={() => setDialog(false)} role="alertdialog" title={t(C.topUp)} icon={<Icon name="lock" size={32} />} actions={<><Button block onClick={() => setDialog(false)}>{t(C.topUp)}</Button><Button block variant="ghost" onClick={() => setDialog(false)}>{t(UI.close)}</Button></>}>
        {t(C.stepRulesDetail)}
      </Dialog>
    </Demo>
  );
}

function Lists(): ReactElement {
  const { t } = useLocale();
  return (
    <Demo title="List, ListRow, Card, Divider, Skeleton, EmptyState">
      <List inset>
        <ListRow leading={<Icon name="wallet" />} title={t(C.budgetLeft)} subtitle={t(C.ofBudget(money(SAMPLE.budget), "31 Oct"))} trailing={money(SAMPLE.left)} chevron href="#components" />
        <ListRow leading={<Icon name="settings" />} tone="neutral" title={t(C.settings)} chevron onClick={() => undefined} />
      </List>
      <Card tone="info"><span className="sg-row"><Icon name="info" /> {t(UI.simulated)}</span></Card>
      <Divider />
      <Skeleton lines={3} />
      <EmptyState wally="offline" title={t(UI.offlineTitle)} body={t(UI.offlineBody)} action={<Button variant="secondary" icon={<Icon name="refresh" size={20} />}>{t(UI.updateReload)}</Button>} />
    </Demo>
  );
}

function Icons(): ReactElement {
  return (
    <Demo title="Icons (24 px, currentColor)">
      <ul className="sg-icons">{ICON_NAMES.map((n) => <li key={n} title={n}><Icon name={n} /><span className="mono">{n}</span></li>)}</ul>
    </Demo>
  );
}

export function ComponentsSection(): ReactElement {
  return (
    <div className="sg-stack">
      <Buttons />
      <Chips />
      <Figures />
      <Controls />
      <Fields />
      <Overlays />
      <Lists />
      <Icons />
    </div>
  );
}
