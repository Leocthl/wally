// #/styleguide/variants/home: three answers to the Budget hero, in the real page around them (bar, the Try asking cards,
// the tab bar) on the on-device booth, which folds real state. Scene buttons set the state; the picker flips the variant.
import type { ReactElement } from "react";
import { BRAND } from "../../brand";
import { UI } from "../../i18n/ui";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { BottomTabBar } from "../../ui/Nav";
import { ShellBar } from "../../shell/ShellBar";
import { HeroAction } from "../home/hero/HeroAction";
import { BudgetHero } from "../home/BudgetHero";
import { HeroRing } from "../home/hero/HeroRing";
import { TryAsking } from "../home/TryAsking";
import { useBoothContext } from "../../hooks/useBooth";
import { VariantPicker, type PickerVariant } from "./Picker";
import { BoothScene } from "./Scene";

function Phone({ withTry, children }: { readonly withTry: boolean; readonly children: ReactElement }): ReactElement {
  const { t } = useLocale();
  const { runScenario, busy } = useBoothContext();
  return (
    <div className="shell-app shell-app--tabs" data-route="budget" data-chip-scope>
      <ShellBar onAbout={() => undefined} />
      <main className="shell-main">
        <div className="home">
          {children}
          {withTry ? (
            <section className="home-block" aria-labelledby="vr-try">
              <h2 id="vr-try" className="home-block__title">{t(UI["home.tryAsking"])}</h2>
              <TryAsking onRun={(id) => void runScenario(id)} busy={busy} />
            </section>
          ) : null}
        </div>
      </main>
      <BottomTabBar
        position="fixed"
        label={t(UI.mainNav)}
        current="budget"
        items={[
          { id: "budget", label: t(UI.tabBudget), icon: <Icon name="wallet" />, href: "#" },
          { id: "wally", label: t(UI.tabWally), icon: <Icon name="sparkle" />, href: "#" },
          { id: "receipts", label: t(UI.tabReceipts), icon: <Icon name="receipt" />, href: "#" },
          { id: "proof", label: t(UI.tabProof), icon: <Icon name="shieldCheck" />, href: "#" },
        ]}
        center={{ label: t(UI["shell.ask"](BRAND.name)), icon: <Icon name="sparkle" size={26} />, onPress: () => undefined }}
      />
    </div>
  );
}

function Stage(): ReactElement {
  const { state, runScenario, busy } = useBoothContext();
  const { packet, mandate } = state;
  if (!packet || !mandate) return <p className="vr-loading">Loading the mock booth</p>;
  const variants: readonly PickerVariant[] = [
    { name: "Greeting", render: () => <Phone withTry><BudgetHero packet={packet} mandate={mandate} /></Phone> },
    { name: "Ring", render: () => <Phone withTry><HeroRing packet={packet} mandate={mandate} /></Phone> },
    { name: "Action", render: () => <Phone withTry={false}><HeroAction packet={packet} mandate={mandate} busy={busy} onRun={(id) => void runScenario(id)} /></Phone> },
  ];
  return <VariantPicker variants={variants} position="top" />;
}

export default function HomeVariants(): ReactElement {
  return (
    <BoothScene>
      <Stage />
    </BoothScene>
  );
}
