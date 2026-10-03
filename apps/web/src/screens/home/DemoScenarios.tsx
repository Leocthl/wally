// "Demo scenarios (for judges)" (just "Demo scenarios" off the booth): the booth's scenario cards, which are a test console and not part of shopping, in a disclosure
// at the bottom of Home. Closed for a shopper; open on the booth Mac, with ?booth=1 and in presenter mode (demoMode.ts), so the
// stage needs no extra tap. The choice is remembered for this browser. Every scenario stays reachable inside. On a laptop it is not
// a disclosure at all but a panel of its own (a section with a heading), so there is nothing to open and no dead control.
import { useId, type ReactElement, type ReactNode } from "react";
import { OB } from "../../i18n/onboarding";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { useDemoOpen, useIsBoothPage } from "./demoMode";

export interface DemoScenariosProps {
  /** The line over the cards (it says whose picks come first when the person's taste is known). */
  readonly lead: string;
  readonly children: ReactNode;
  /** Whether this is the booth's own page (default: read from the address, ?booth=1 and presenter mode). A test says it outright. */
  readonly booth?: boolean;
  /** An always-open panel (the laptop's Budget screen) instead of a disclosure. The Ask sheet keeps the disclosure. */
  readonly panel?: boolean;
}

export function DemoScenarios({ lead, children, booth, panel = false }: DemoScenariosProps): ReactElement {
  const { t } = useLocale();
  const [open, choose] = useDemoOpen();
  const onBooth = useIsBoothPage();
  const heading = useId();
  // "for judges" only on the booth's pages; on a friend's phone the cards are just a demo.
  const title = t((booth ?? onBooth) ? OB.home.demo : OB.home.demoPlain);
  if (panel) {
    return (
      <section className="home-demo" aria-labelledby={heading} data-demo-disclosure data-static>
        <h2 id={heading} className="home-demo__summary">{title}</h2>
        <div className="home-demo__body">
          <p className="home-block__lead">{lead}</p>
          {children}
        </div>
      </section>
    );
  }
  // The browser also fires toggle when the open attribute is first set: only a change the person made is a choice to remember.
  const toggled = (el: HTMLDetailsElement): void => {
    if (el.open !== open) choose(el.open);
  };
  return (
    <details className="home-demo" open={open} onToggle={(e) => toggled(e.currentTarget)} data-demo-disclosure>
      <summary className="home-demo__summary">
        <span className="home-demo__title">{title}</span>
        <Icon name="chevronRight" size={20} className="home-demo__chevron" />
      </summary>
      <div className="home-demo__body">
        <h2 className="sr-only">{title}</h2>
        <p className="home-block__lead">{lead}</p>
        {children}
      </div>
    </details>
  );
}
