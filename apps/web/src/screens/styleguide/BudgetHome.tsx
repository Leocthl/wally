// Composition: the Budget home. Balance-first hero with rounded bottom corners, rules as quiet tags, recent decisions
// as card rows, suggestions, and the raised "Ask" action in the tab bar opening the composer sheet.
import { useState, type ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { UI } from "../../i18n/ui";
import { IconButton } from "../../ui/Button";
import { ProvenanceChip, Tag } from "../../ui/Chip";
import { ProgressBar, Stat } from "../../ui/Data";
import { TextField } from "../../ui/Form";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { BottomTabBar } from "../../ui/Nav";
import { Sheet } from "../../ui/Overlay";
import { HeroPanel, List, ListRow } from "../../ui/Surface";
import { C } from "./copy";
import { Phone, SectionHead } from "./Phone";
import { money, SAMPLE, shortDate } from "./sample";

export function useTabs(): readonly { readonly id: string; readonly label: string; readonly icon: ReactElement }[] {
  const { t } = useLocale();
  return [
    { id: "budget", label: t(UI.tabBudget), icon: <Icon name="wallet" /> },
    { id: "wally", label: t(UI.tabWally), icon: <Icon name="sparkle" /> },
    { id: "receipts", label: t(UI.tabReceipts), icon: <Icon name="receipt" /> },
    { id: "proof", label: t(UI.tabProof), icon: <Icon name="shieldCheck" /> },
  ];
}

function AskSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): ReactElement {
  const { t } = useLocale();
  return (
    <Sheet open={open} onClose={onClose} title={t(C.askLabel)} description={t(C.stepPickedDetail)}>
      <TextField
        variant="pill"
        label={t(C.askLabel)}
        hideLabel
        placeholder={t(C.askPlaceholder)}
        enterKeyHint="send"
        trailing={<><IconButton label={t(C.voice)} icon={<Icon name="mic" />} /><IconButton label={t(C.send)} variant="primary" icon={<Icon name="arrowUp" />} /></>}
      />
    </Sheet>
  );
}

function Hero(): ReactElement {
  const { t, locale } = useLocale();
  const left = money(SAMPLE.left);
  const total = money(SAMPLE.budget);
  const until = shortDate(SAMPLE.until, locale);
  return (
    <HeroPanel label={t(C.budgetLeft)}>
      <div className="sg-hero__top">
        <span className="sg-avatar" aria-hidden="true">{SAMPLE.name.slice(0, 1)}</span>
        <p className="sg-hero__hello">{t(C.hi(SAMPLE.name))}</p>
        <ProvenanceChip prov={SIMULATED} />
      </div>
      <Stat onHero size="xl" label={t(C.budgetLeft)} value={left} sub={t(C.ofBudget(total, until))} />
      <ProgressBar tone="on-hero" role="meter" value={SAMPLE.left} max={SAMPLE.budget} label={t(C.budgetLeft)} valueText={`${left} / ${total}`} />
      <div className="sg-hero__tags">
        <Tag tone="on-hero" size="sm" icon={<Icon name="tag" size={14} />}>{t(C.ruleClothes)}</Tag>
        <Tag tone="on-hero" size="sm" icon={<Icon name="store" size={14} />}>{t(C.ruleVerified)}</Tag>
        <Tag tone="on-hero" size="sm" icon={<Icon name="lock" size={14} />}>{t(C.ruleSigned)}</Tag>
      </div>
    </HeroPanel>
  );
}

export function BudgetHome(): ReactElement {
  const { t } = useLocale();
  const [asking, setAsking] = useState(false);
  const tabs = useTabs();
  return (
    <Phone title="Budget home">
      <Hero />
      <div className="sg-body">
        <SectionHead title={t(C.recent)} action={<a className="sg-link" href="#sg-receipts">{t(C.seeAll)}</a>} />
        <List cards label={t(C.recent)}>
          <ListRow leading={<Icon name="checkCircle" />} tone="ok" title={t(C.jacket)} subtitle={<Tag tone="ok" size="sm">{t(C.approved)}</Tag>} trailing={money(SAMPLE.jacket)} chevron onClick={() => undefined} />
          <ListRow leading={<Icon name="hand" />} tone="stop" title={t(C.sneakers)} subtitle={<Tag tone="stop" size="sm">{t(C.stoppedShort)}</Tag>} trailing={money(SAMPLE.shoes)} chevron onClick={() => undefined} />
        </List>
        <SectionHead title={t(C.tryAsking)} />
        <div className="sg-suggest">
          {[t(C.suggestTee(money(SAMPLE.teeMax))), t(C.suggestSocks), t(C.suggestGift)].map((s) => (
            <button key={s} type="button" className="sg-suggest__chip" onClick={() => setAsking(true)}>{s}</button>
          ))}
        </div>
      </div>
      <BottomTabBar position="static" label={t(UI.mainNav)} items={tabs} current="budget" center={{ label: t(C.ask), icon: <Icon name="sparkle" size={26} />, onPress: () => setAsking(true) }} />
      <AskSheet open={asking} onClose={() => setAsking(false)} />
    </Phone>
  );
}
