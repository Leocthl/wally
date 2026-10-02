// Folds secondary detail on a phone and opens it on a wide screen, so the StopBanner stays above the fold (docs/04 Phone).
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { LabelPair } from "../i18n/label";
import { useWide } from "../hooks/useWide";
import { Bi } from "./Bi";

export function Disclosure({ title, children, id }: { readonly title: LabelPair; readonly children: ReactNode; readonly id: string }): ReactElement {
  const wide = useWide();
  const [open, setOpen] = useState(wide);
  useEffect(() => setOpen(wide), [wide]);
  return (
    <details className="disclosure" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-disclosure={id}>
      <summary><Bi text={title} /></summary>
      {children}
    </details>
  );
}
