// Composition: Proof. A shield that says the receipts check out on this phone, the latest receipts, and "Try to
// tamper", which flips the result to "Broken at receipt 7" (static sample; the real verifier lives in the log screen).
import { useState, type ReactElement } from "react";
import { UI } from "../../i18n/ui";
import { Button } from "../../ui/Button";
import { haptic } from "../../ui/haptics";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { BottomTabBar, TopBar } from "../../ui/Nav";
import { Card, List, ListRow } from "../../ui/Surface";
import { useTabs } from "./BudgetHome";
import { C } from "./copy";
import { Phone, SectionHead } from "./Phone";
import { money, SAMPLE } from "./sample";

function Receipt({ state, n, hash }: { readonly state: string; readonly n: number; readonly hash: string }): ReactElement {
  return <>{state} · <span className="mono" data-selectable>#{n} {hash}</span></>;
}

export function Proof(): ReactElement {
  const { t } = useLocale();
  const tabs = useTabs();
  const [broken, setBroken] = useState(false);
  const toggle = (): void => {
    setBroken((b) => !b);
    haptic(broken ? "success" : "stop");
  };
  return (
    <Phone title="Proof">
      <div className="sg-body sg-body--top" id="sg-receipts">
        <TopBar sticky={false} large title={t(C.proof)} />
        <Card tone={broken ? "stop" : "ok"} padding="lg" className="sg-proof">
          <span className={broken ? "sg-proof__icon sg-proof__icon--stop" : "sg-proof__icon"}><Icon name={broken ? "shieldAlert" : "shieldCheck"} size={36} /></span>
          <span role="status" className="sg-proof__text">
            <strong className="sg-proof__title">{broken ? t(C.brokenAt(String(SAMPLE.brokenAt))) : t(C.verifiedCount(String(SAMPLE.receipts)))}</strong>
            <span className="sg-muted">{broken ? t(C.brokenBody) : t(C.verifiedHere)}</span>
          </span>
        </Card>
        <SectionHead title={t(C.lastReceipts)} />
        <List inset label={t(C.lastReceipts)}>
          <ListRow leading={<Icon name="checkCircle" />} tone="ok" title={t(C.jacket)} subtitle={<Receipt state={t(C.approved)} n={SAMPLE.receipts} hash={SAMPLE.hashes[0]} />} trailing={money(SAMPLE.jacket)} />
          <ListRow leading={<Icon name="hand" />} tone="stop" title={t(C.sneakers)} subtitle={<Receipt state={t(C.stoppedShort)} n={SAMPLE.receipts - 1} hash={SAMPLE.hashes[1]} />} trailing={money(SAMPLE.shoes)} />
          <ListRow leading={<Icon name="lock" />} title={t(C.rulesSealed)} subtitle={<Receipt state={t(C.signedBy)} n={SAMPLE.receipts - 2} hash={SAMPLE.hashes[2]} />} />
        </List>
        <div className="sg-actions">
          <Button variant={broken ? "secondary" : "danger"} block icon={<Icon name={broken ? "refresh" : "alert"} size={20} />} onClick={toggle}>{broken ? t(C.restore) : t(C.tamper)}</Button>
        </div>
      </div>
      <BottomTabBar position="static" label={t(UI.mainNav)} items={tabs} current="proof" center={{ label: t(C.ask), icon: <Icon name="chat" size={26} />, onPress: () => undefined }} />
    </Phone>
  );
}
