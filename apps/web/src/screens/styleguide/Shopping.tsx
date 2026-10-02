// Composition: Wally is shopping. The item, then the four steps in plain words; the planner, judge, rules and rail are
// "Wally picks", "Wally reads the listing", "Rules check" and "One-off card". Times carry one quiet SIMULATED chip.
import type { ReactElement } from "react";
import { SIMULATED } from "../../domain/provenance";
import { UI } from "../../i18n/ui";
import { ProvenanceChip, Tag } from "../../ui/Chip";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { BottomTabBar, TopBar } from "../../ui/Nav";
import { Steps } from "../../ui/Steps";
import { Card } from "../../ui/Surface";
import { Wally } from "../../wally/Wally";
import { useTabs } from "./BudgetHome";
import { C } from "./copy";
import { Phone } from "./Phone";
import { money, SAMPLE } from "./sample";

export function Shopping(): ReactElement {
  const { t } = useLocale();
  const tabs = useTabs();
  return (
    <Phone title="Wally is shopping">
      <div className="sg-body sg-body--top">
        <TopBar sticky={false} title={t(C.shopping)} leading={<Wally state="thinking" size={44} decorative />} subtitle={t(C.forYou)} />
        <Card elevated className="sg-item">
          <span className="sg-item__thumb" aria-hidden="true"><Icon name="tag" size={28} /></span>
          <span className="sg-item__text">
            <span className="sg-item__title">{t(C.jacket)}</span>
            <span className="sg-item__meta">{t(C.inclShipping(money(SAMPLE.jacket)))}</span>
            <Tag tone="ok" size="sm" icon={<Icon name="checkCircle" size={14} />}>{t(C.verifiedSeller)}</Tag>
          </span>
        </Card>
        <Card>
          <Steps
            label={t(C.stepsLabel)}
            items={[
              { id: "pick", title: t(C.stepPicked), detail: t(C.stepPickedDetail), time: SAMPLE.timings.picked, status: "done" },
              { id: "read", title: t(C.stepRead), detail: t(C.stepReadDetail), time: SAMPLE.timings.read, status: "done" },
              { id: "rules", title: t(C.stepRules), detail: t(C.stepRulesDetail), time: SAMPLE.timings.rules, status: "done" },
              { id: "card", title: t(C.stepCard), detail: t(C.stepCardDetail), status: "now" },
            ]}
          />
          <p className="sg-note"><ProvenanceChip prov={SIMULATED} /> {t(C.timesSimulated)}</p>
        </Card>
      </div>
      <BottomTabBar position="static" label={t(UI.mainNav)} items={tabs} current="wally" center={{ label: t(C.ask), icon: <Icon name="sparkle" size={26} />, onPress: () => undefined }} />
    </Phone>
  );
}
