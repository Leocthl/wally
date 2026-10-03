// "Demo scenarios (for judges)": the booth's scenario cards, which are a test console and not part of shopping, in a disclosure
// at the bottom of Home. Closed for a shopper; open on the booth Mac, with ?booth=1 and in presenter mode (demoMode.ts), so the
// stage needs no extra tap. The choice is remembered for this browser. Every scenario stays reachable inside.
import type { ReactElement, ReactNode } from "react";
import { OB } from "../../i18n/onboarding";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { useDemoOpen } from "./demoMode";

export interface DemoScenariosProps {
  /** The line over the cards (it says whose picks come first when the person's taste is known). */
  readonly lead: string;
  readonly children: ReactNode;
}

export function DemoScenarios({ lead, children }: DemoScenariosProps): ReactElement {
  const { t } = useLocale();
  const [open, choose] = useDemoOpen();
  // The browser also fires toggle when the open attribute is first set: only a change the person made is a choice to remember.
  const toggled = (el: HTMLDetailsElement): void => {
    if (el.open !== open) choose(el.open);
  };
  return (
    <details className="home-demo" open={open} onToggle={(e) => toggled(e.currentTarget)} data-demo-disclosure>
      <summary className="home-demo__summary">
        <span className="home-demo__title">{t(OB.home.demo)}</span>
        <Icon name="chevronRight" size={20} className="home-demo__chevron" />
      </summary>
      <div className="home-demo__body">
        <h2 className="sr-only">{t(OB.home.demo)}</h2>
        <p className="home-block__lead">{lead}</p>
        {children}
      </div>
    </details>
  );
}
