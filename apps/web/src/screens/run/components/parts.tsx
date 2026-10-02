// Shared pieces of the result states: the hero block (Wally, one big sentence, the figure) and the footnote that says
// fixed rules decided, not the AI.
import type { ReactElement, ReactNode, Ref } from "react";
import { UI } from "../../../i18n/ui";
import { cx } from "../../../ui/cx";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Wally, type WallyState } from "../../../wally/Wally";

export interface HeroProps {
  readonly tone: "ok" | "stop" | "warn" | "calm";
  readonly wally: WallyState;
  readonly title: string;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** role="alert" for a stop, role="status" for an approval; none for a question (its own card speaks). */
  readonly role?: "alert" | "status";
  readonly fresh: boolean;
  readonly children?: ReactNode;
}

export function Hero({ tone, wally, title, headingRef, role, fresh, children }: HeroProps): ReactElement {
  return (
    <section className={cx("run-hero", `run-hero--${tone}`, fresh && "run-hero--enter")} role={role}>
      <Wally state={wally} size={104} decorative className="run-hero__wally" />
      <h2 className="run-hero__title" tabIndex={-1} ref={headingRef}>{title}</h2>
      {children}
    </section>
  );
}

export function Footnote(): ReactElement {
  const { t } = useLocale();
  return (
    <p className="run-foot">
      <Icon name="shieldCheck" size={18} /> <span>{t(UI.run.rulesDecided)}</span>
    </p>
  );
}

export function SimNote(): ReactElement {
  const { t } = useLocale();
  return <p className="run-sim">{t(UI.run.simulatedCard)}</p>;
}
