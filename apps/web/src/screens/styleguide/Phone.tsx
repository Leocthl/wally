// A phone-width stage for one composition: full bleed on a phone, a rounded frame on wider screens.
import type { ReactElement, ReactNode } from "react";
import { cx } from "../../ui/cx";

export function Phone({ title, children, className }: { readonly title: string; readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <figure className={cx("sg-phone", className)} aria-label={title}>
      <figcaption className="sg-phone__caption">{title}</figcaption>
      <div className="sg-phone__screen">{children}</div>
    </figure>
  );
}

export function SectionHead({ title, action }: { readonly title: string; readonly action?: ReactNode }): ReactElement {
  return (
    <div className="sg-section-head">
      <h3 className="sg-section-head__title">{title}</h3>
      {action}
    </div>
  );
}
